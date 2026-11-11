//! Native gamepad input (gilrs / evdev). Works even when the launcher is hidden,
//! which lets the Guide (Xbox) button summon it at any time.

use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use gilrs::{Axis, Button, EventType, Gilrs};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::{window, AppState};

#[derive(Debug, Clone, Serialize)]
pub struct PadEvent {
    pub button: &'static str,
    pub repeat: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PadInfo {
    pub connected: bool,
    pub name: String,
}

const STICK_ON: f32 = 0.55;
const STICK_OFF: f32 = 0.35;
const REPEAT_DELAY: Duration = Duration::from_millis(380);
const REPEAT_RATE: Duration = Duration::from_millis(110);
const REPEAT_FAST: Duration = Duration::from_millis(55);

fn map_button(b: Button) -> Option<&'static str> {
    Some(match b {
        Button::South => "a",
        Button::East => "b",
        Button::West => "x",
        Button::North => "y",
        Button::LeftTrigger => "lb",
        Button::RightTrigger => "rb",
        Button::LeftTrigger2 => "lt",
        Button::RightTrigger2 => "rt",
        Button::Select => "select",
        Button::Start => "start",
        Button::Mode => "guide",
        Button::LeftThumb => "ls",
        Button::RightThumb => "rs",
        Button::DPadUp => "up",
        Button::DPadDown => "down",
        Button::DPadLeft => "left",
        Button::DPadRight => "right",
        _ => return None,
    })
}

fn repeats(button: &str) -> bool {
    matches!(button, "up" | "down" | "left" | "right" | "lb" | "rb" | "lt" | "rt")
}

struct Held {
    next: Instant,
    count: u32,
}

pub fn spawn(app: AppHandle) {
    std::thread::Builder::new()
        .name("gamepad".into())
        .spawn(move || run(app))
        .expect("spawn gamepad thread");
}

fn run(app: AppHandle) {
    let mut gilrs = match Gilrs::new() {
        Ok(g) => g,
        Err(e) => {
            log::error!("Gamepad init failed: {e}");
            return;
        }
    };
    for (_, pad) in gilrs.gamepads() {
        log::info!("Gamepad: {}", pad.name());
        let _ = app.emit("pad-connection", PadInfo { connected: true, name: pad.name().to_string() });
    }

    let mut held: HashMap<&'static str, Held> = HashMap::new();
    // Stick-derived direction state per axis: -1, 0, 1
    let mut stick: HashMap<(usize, Axis), i8> = HashMap::new();
    let mut last_guide = Instant::now() - Duration::from_secs(5);

    loop {
        while let Some(ev) = gilrs.next_event_blocking(Some(Duration::from_millis(16))) {
            let state = app.state::<AppState>();
            match ev.event {
                EventType::Connected => {
                    let name = gilrs.gamepad(ev.id).name().to_string();
                    let _ = app.emit("pad-connection", PadInfo { connected: true, name });
                }
                EventType::Disconnected => {
                    let name = gilrs.gamepad(ev.id).name().to_string();
                    let _ = app.emit("pad-connection", PadInfo { connected: false, name });
                }
                EventType::ButtonPressed(b, _) => {
                    let Some(name) = map_button(b) else { continue };
                    if name == "guide" {
                        if last_guide.elapsed() > Duration::from_millis(400) {
                            last_guide = Instant::now();
                            on_guide(&app, &state);
                        }
                        continue;
                    }
                    press(&app, &state, name, &mut held);
                }
                EventType::ButtonReleased(b, _) => {
                    if let Some(name) = map_button(b) {
                        held.remove(name);
                    }
                }
                EventType::AxisChanged(axis, value, _) => {
                    let (neg, pos) = match axis {
                        Axis::LeftStickX => ("left", "right"),
                        Axis::LeftStickY => ("down", "up"),
                        _ => continue,
                    };
                    let key = (usize::from(ev.id), axis);
                    let cur = *stick.get(&key).unwrap_or(&0);
                    let next = if value > STICK_ON {
                        1
                    } else if value < -STICK_ON {
                        -1
                    } else if value.abs() < STICK_OFF {
                        0
                    } else {
                        cur
                    };
                    if next != cur {
                        if cur == 1 { held.remove(pos); }
                        if cur == -1 { held.remove(neg); }
                        if next == 1 { press(&app, &state, pos, &mut held); }
                        if next == -1 { press(&app, &state, neg, &mut held); }
                        stick.insert(key, next);
                    }
                }
                _ => {}
            }
        }

        // Auto-repeat for held directional buttons
        let now = Instant::now();
        let state = app.state::<AppState>();
        for (name, h) in held.iter_mut() {
            if now >= h.next {
                h.count += 1;
                h.next = now + if h.count > 8 { REPEAT_FAST } else { REPEAT_RATE };
                emit_nav(&app, &state, name, true);
            }
        }
    }
}

fn press(app: &AppHandle, state: &AppState, name: &'static str, held: &mut HashMap<&'static str, Held>) {
    emit_nav(app, state, name, false);
    if repeats(name) {
        held.insert(name, Held { next: Instant::now() + REPEAT_DELAY, count: 0 });
    }
}

/// Navigation events are only delivered while the launcher is visible and focused,
/// so input meant for a running game never drives the launcher UI.
fn emit_nav(app: &AppHandle, state: &AppState, name: &'static str, repeat: bool) {
    if state.visible.load(Ordering::Relaxed) && state.focused.load(Ordering::Relaxed) {
        let _ = app.emit("pad", PadEvent { button: name, repeat });
    }
}

fn on_guide(app: &AppHandle, state: &AppState) {
    if !state.guide_enabled.load(Ordering::Relaxed) {
        return;
    }
    let visible = state.visible.load(Ordering::Relaxed);
    let focused = state.focused.load(Ordering::Relaxed);
    if visible && focused {
        // Already in front: if a game is running, go back to it; otherwise go home.
        if state.running.lock().is_some() {
            window::hide(app);
        } else {
            let _ = app.emit("pad", PadEvent { button: "guide", repeat: false });
        }
    } else {
        window::show(app);
        let _ = app.emit("guide-summon", ());
    }
}
