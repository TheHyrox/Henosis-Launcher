//! Launcher window visibility and focus handling (KDE Wayland aware).

use std::process::Command;
use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::AppState;

const KWIN_SCRIPT: &str = r#"
const list = typeof workspace.windowList === "function" ? workspace.windowList() : workspace.clientList();
for (let i = 0; i < list.length; i++) {
    const w = list[i];
    const cls = String(w.resourceClass || "").toLowerCase();
    if (w.caption === "Nexus" || cls.indexOf("nexus") !== -1) {
        w.minimized = false;
        if ("activeWindow" in workspace) { workspace.activeWindow = w; } else { workspace.activeClient = w; }
    }
}
"#;

pub fn show(app: &AppHandle) {
    let Some(w) = app.get_webview_window("main") else { return };
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_fullscreen(true);
    let _ = w.set_focus();
    if let Some(state) = app.try_state::<AppState>() {
        state.visible.store(true, Ordering::Relaxed);
    }
    let _ = app.emit("launcher-shown", ());

    // Wayland compositors may refuse focus requests from background apps; ask KWin directly.
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(250));
        let focused = app.try_state::<AppState>().map(|s| s.focused.load(Ordering::Relaxed)).unwrap_or(true);
        if !focused {
            kwin_activate(&app);
        }
    });
}

pub fn hide(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    if let Some(state) = app.try_state::<AppState>() {
        state.visible.store(false, Ordering::Relaxed);
        state.focused.store(false, Ordering::Relaxed);
    }
}

/// Activate the launcher window through a short-lived KWin script (KDE Plasma only).
fn kwin_activate(app: &AppHandle) {
    if std::env::var("XDG_CURRENT_DESKTOP").map(|d| !d.to_uppercase().contains("KDE")).unwrap_or(true) {
        return;
    }
    let qdbus = ["qdbus6", "qdbus"].into_iter().find(|b| crate::emulators::which(b).is_some());
    let Some(qdbus) = qdbus else { return };
    let Some(state) = app.try_state::<AppState>() else { return };
    let script = state.data_dir.join("kwin-activate.js");
    if std::fs::write(&script, KWIN_SCRIPT).is_err() {
        return;
    }
    let name = "nexus-activate";
    let _ = Command::new(qdbus).args(["org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", name]).output();
    let out = Command::new(qdbus)
        .args(["org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.loadScript", &script.to_string_lossy(), name])
        .output();
    if let Ok(out) = out {
        let id = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if id.parse::<i64>().map(|n| n >= 0).unwrap_or(false) {
            let obj = format!("/Scripting/Script{id}");
            let _ = Command::new(qdbus).args(["org.kde.KWin", &obj, "org.kde.kwin.Script.run"]).output();
        }
    }
    let _ = Command::new(qdbus).args(["org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", name]).output();
}
