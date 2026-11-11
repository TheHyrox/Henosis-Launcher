//! Game launching, session tracking and per-game file overrides.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::db::now;
use crate::emulators::{self, BuildContext, CommandSpec};
use crate::models::{Emulator, Game};
use crate::settings::GameSettings;
use crate::{window, AppState};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningGame {
    pub game_id: i64,
    pub title: String,
    pub platform: String,
    pub started: i64,
    #[serde(skip)]
    pub pgid: Option<u32>,
    #[serde(skip)]
    pub steam_app_id: Option<u32>,
    #[serde(skip)]
    pub stop: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameEnded {
    pub game_id: i64,
    pub duration: i64,
    pub error: Option<String>,
}

/// Resolve which emulator a game will use.
pub fn resolve_emulator(state: &AppState, game: &Game, settings: &GameSettings) -> Result<Option<Emulator>, String> {
    if game.source == "steam" || game.platform == "pc" {
        return Ok(None);
    }
    let db = state.db.lock();
    let pc = db.platform_config(&game.platform).map_err(|e| e.to_string())?;
    let wanted = settings.emulator_id.clone().or(pc.default_emulator.clone());
    if let Some(id) = wanted {
        if let Some(e) = db.emulator(&id).map_err(|e| e.to_string())? {
            return Ok(Some(e));
        }
    }
    let all = db.emulators().map_err(|e| e.to_string())?;
    // Prefer a dedicated emulator over RetroArch when both support the platform.
    let mut candidates: Vec<Emulator> = all.into_iter().filter(|e| e.platforms.contains(&game.platform)).collect();
    candidates.sort_by_key(|e| (e.preset == "retroarch") as u8);
    match candidates.into_iter().next() {
        Some(e) => Ok(Some(e)),
        None => Err(format!(
            "No emulator configured for {}. Add one in Settings → Emulators.",
            crate::platforms::get(&game.platform).map(|p| p.name).unwrap_or(&game.platform)
        )),
    }
}

pub fn effective_settings(state: &AppState, game: &Game) -> GameSettings {
    let db = state.db.lock();
    let pc = db.platform_config(&game.platform).unwrap_or_default();
    pc.settings.overlay(&game.settings)
}

/// Build the command that would be executed for a game (also used for previews).
pub fn build(state: &AppState, game: &Game) -> Result<CommandSpec, String> {
    let settings = effective_settings(state, game);
    let mut env = Vec::new();

    if game.source == "steam" {
        let appid = game.steam_app_id.ok_or("Missing Steam app id")?;
        let url = format!("steam://rungameid/{appid}");
        let (program, args) = if emulators::which("steam").is_some() {
            ("steam".to_string(), vec![url])
        } else if emulators::flatpak_apps().contains("com.valvesoftware.Steam") {
            ("flatpak".to_string(), vec!["run".into(), "com.valvesoftware.Steam".into(), url])
        } else {
            ("xdg-open".to_string(), vec![url])
        };
        // Wrappers don't apply to Steam games: use Steam launch options instead.
        return Ok(CommandSpec { program, args, env, workdir: None });
    }

    if game.platform == "pc" || game.source == "manual" && game.platform == "pc" {
        let p = Path::new(&game.path);
        let lower = game.path.to_lowercase();
        let mut args: Vec<String> = Vec::new();
        let program = if lower.ends_with(".exe") || lower.ends_with(".bat") {
            let runner = ["umu-run", "wine"].into_iter().find(|r| emulators::which(r).is_some())
                .ok_or("Windows executables need umu-run or wine installed")?;
            args.push(game.path.clone());
            runner.to_string()
        } else if lower.ends_with(".sh") {
            args.push(game.path.clone());
            "bash".to_string()
        } else if lower.ends_with(".desktop") {
            args.push(p.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default());
            "gtk-launch".to_string()
        } else {
            game.path.clone()
        };
        if let Some(extra) = &settings.launch_args {
            args.extend(emulators::shell_split(extra));
        }
        let workdir = p.parent().map(|d| d.to_string_lossy().to_string());
        return emulators::wrap(program, args, &settings, &mut env, workdir);
    }

    let emu = resolve_emulator(state, game, &settings)?.ok_or("No emulator")?;
    let bios = state.db.lock().platform_config(&game.platform).ok().and_then(|c| c.bios_dir);
    let run_dir = state.data_dir.join("run");
    emulators::build_command(&emu, &BuildContext { game, settings: &settings, bios_dir: bios.as_deref(), run_dir: &run_dir })
}

pub fn launch(app: &AppHandle, game_id: i64) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.running.lock().is_some() {
        return Err("A game is already running".into());
    }
    let game = state.db.lock().game(game_id).map_err(|e| e.to_string())?.ok_or("Game not found")?;
    if game.source != "steam" && !Path::new(&game.path).exists() && game.platform != "pc" {
        return Err(format!("Game file not found: {}", game.path));
    }
    let settings = effective_settings(&state, &game);
    let spec = build(&state, &game)?;
    log::info!("Launching {}: {}", game.title, spec.display());

    // Per-game overrides (config files, mod folders)
    let journal = state.data_dir.join("restore-journal.json");
    let applied = apply_overrides(&settings, &journal)?;

    let log_dir = state.data_dir.join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    let log_path = log_dir.join(format!("game-{}.log", game.id));
    let mut log_file = std::fs::File::create(&log_path).map_err(|e| e.to_string())?;
    let _ = writeln!(log_file, "$ {}\n", spec.display());
    let err_file = log_file.try_clone().map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&spec.program);
    cmd.args(&spec.args).stdin(Stdio::null()).stdout(Stdio::from(log_file)).stderr(Stdio::from(err_file));
    for (k, v) in &spec.env {
        cmd.env(k, v);
    }
    if let Some(w) = &spec.workdir {
        cmd.current_dir(w);
    }
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            restore_overrides(&journal);
            return Err(format!("Failed to start {}: {e}", spec.program));
        }
    };
    let stop = Arc::new(AtomicBool::new(false));
    let is_steam = game.source == "steam";
    let running = RunningGame {
        game_id: game.id,
        title: game.title.clone(),
        platform: game.platform.clone(),
        started: now(),
        pgid: (!is_steam).then_some(child.id()),
        steam_app_id: game.steam_app_id,
        stop: stop.clone(),
    };
    *state.running.lock() = Some(running.clone());
    let _ = app.emit("game-started", &running);

    let hide = state.db.lock().app_settings().hide_on_launch;
    let child_pid = child.id();

    let app2 = app.clone();
    std::thread::spawn(move || {
        let started_at = Instant::now();
        let started = now();
        let mut error = None;

        if is_steam {
            // If Steam wasn't running, this process *is* Steam: reap it separately, never wait on it.
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            if let Some(appid) = running.steam_app_id {
                track_steam(&app2, appid, &stop, hide);
            }
        } else {
            if hide {
                let app_hide = app2.clone();
                let stop_hide = stop.clone();
                std::thread::spawn(move || {
                    wait_until_emulator_window_ready(child_pid, &stop_hide);
                    if !stop_hide.load(Ordering::Relaxed) {
                        window::hide(&app_hide);
                    }
                });
            }
            match child.wait() {
                Ok(status) if !status.success() && started_at.elapsed() < Duration::from_secs(5) => {
                    let tail = std::fs::read_to_string(&log_path).unwrap_or_default();
                    let tail: Vec<&str> = tail.lines().rev().take(8).collect();
                    let tail: Vec<&str> = tail.into_iter().rev().collect();
                    error = Some(format!("Exited with {status}\n{}", tail.join("\n")));
                }
                Ok(_) => {}
                Err(e) => error = Some(e.to_string()),
            }
            stop.store(true, Ordering::Relaxed);
        }

        if applied {
            restore_overrides(&journal);
        }
        let ended = now();
        let state = app2.state::<AppState>();
        let duration = ended - started;
        if error.is_none() && duration >= 3 {
            if let Err(e) = state.db.lock().record_session(running.game_id, started, ended) {
                log::error!("record_session: {e}");
            }
        }
        *state.running.lock() = None;
        let _ = app2.emit("game-ended", GameEnded { game_id: running.game_id, duration, error });
        window::show(&app2);
    });
    Ok(())
}

/// Wait until an emulator process (or its children, e.g. AppImage mount) opens a display/GPU
/// handle or 2.8 seconds have elapsed, so the launcher stays in front during startup.
fn wait_until_emulator_window_ready(root_pid: u32, stop: &AtomicBool) {
    let start = Instant::now();
    // Always keep the "Launching…" screen visible for at least 1.4s so the transition feels intentional.
    while start.elapsed() < Duration::from_millis(1400) {
        if stop.load(Ordering::Relaxed) {
            return;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    let deadline = Instant::now() + Duration::from_millis(3200);
    while Instant::now() < deadline {
        if stop.load(Ordering::Relaxed) || process_tree_has_gpu_or_display(root_pid) {
            return;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

fn process_tree_has_gpu_or_display(root_pid: u32) -> bool {
    let Ok(fds) = std::fs::read_dir(format!("/proc/{root_pid}/fd")) else { return false };
    for fd in fds.flatten() {
        if let Ok(link) = std::fs::read_link(fd.path()) {
            let s = link.to_string_lossy();
            if s.contains("/dev/dri/render") || s.contains("/dev/dri/card") || s.contains("wayland") {
                return true;
            }
        }
    }
    false
}

/// Wait for a Steam game: keep the launcher in front until the game process actually spawns,
/// then hide the launcher and wait until the game exits.
fn track_steam(app: &AppHandle, appid: u32, stop: &AtomicBool, hide: bool) {
    let deadline = Instant::now() + Duration::from_secs(120);
    while steam_pids(appid).is_empty() {
        if Instant::now() > deadline || stop.load(Ordering::Relaxed) {
            return;
        }
        std::thread::sleep(Duration::from_millis(600));
    }
    // Give the game window a brief moment to map on screen before hiding the launcher.
    std::thread::sleep(Duration::from_millis(1200));
    if hide && !stop.load(Ordering::Relaxed) {
        window::hide(app);
    }
    while !steam_pids(appid).is_empty() {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        std::thread::sleep(Duration::from_secs(2));
    }
}

/// Processes belonging to a running Steam game (identified by the SteamAppId env var).
pub fn steam_pids(appid: u32) -> Vec<u32> {
    let needle = format!("SteamAppId={appid}");
    let mut pids = Vec::new();
    let Ok(rd) = std::fs::read_dir("/proc") else { return pids };
    for e in rd.flatten() {
        let Some(pid) = e.file_name().to_str().and_then(|s| s.parse::<u32>().ok()) else { continue };
        if let Ok(env) = std::fs::read(format!("/proc/{pid}/environ")) {
            if env.split(|b| *b == 0).any(|kv| kv == needle.as_bytes()) {
                pids.push(pid);
            }
        }
    }
    pids
}

pub fn stop(state: &AppState) -> Result<(), String> {
    let running = state.running.lock().clone().ok_or("No game running")?;
    running.stop.store(true, Ordering::Relaxed);
    let signal = |sig: &str, targets: Vec<String>| {
        if !targets.is_empty() {
            let _ = Command::new("kill").arg(sig).arg("--").args(targets).status();
        }
    };
    let targets: Vec<String> = match (running.pgid, running.steam_app_id) {
        (Some(pg), _) => vec![format!("-{pg}")],
        (None, Some(app)) => steam_pids(app).into_iter().map(|p| p.to_string()).collect(),
        _ => vec![],
    };
    signal("-TERM", targets.clone());
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(4));
        signal("-KILL", targets);
    });
    Ok(())
}

// ── Per-game file overrides ─────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct JournalEntry {
    target: String,
    had_original: bool,
}

fn backup_path(target: &Path) -> PathBuf {
    let mut s = target.as_os_str().to_owned();
    s.push(".henosis-backup");
    PathBuf::from(s)
}

/// Swap per-game config files into place and symlink mod folders. Returns true if anything was applied.
fn apply_overrides(s: &GameSettings, journal: &Path) -> Result<bool, String> {
    let mut entries: Vec<JournalEntry> = Vec::new();
    let mut work: Vec<(PathBuf, PathBuf, bool)> = Vec::new(); // (source, target, symlink)
    for o in s.config_overrides.iter().flatten() {
        work.push((PathBuf::from(&o.source), PathBuf::from(&o.target), false));
    }
    if s.mods_enabled == Some(true) {
        for o in s.mod_links.iter().flatten() {
            work.push((PathBuf::from(&o.source), PathBuf::from(&o.target), true));
        }
    }
    if work.is_empty() {
        return Ok(false);
    }
    let result = (|| -> Result<(), String> {
        for (source, target, link) in &work {
            if !source.exists() {
                return Err(format!("Override source missing: {}", source.display()));
            }
            let had = target.exists() || target.is_symlink();
            if had {
                std::fs::rename(target, backup_path(target)).map_err(|e| format!("backup {}: {e}", target.display()))?;
            } else if let Some(parent) = target.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            entries.push(JournalEntry { target: target.to_string_lossy().to_string(), had_original: had });
            std::fs::write(journal, serde_json::to_string(&entries).unwrap_or_default()).map_err(|e| e.to_string())?;
            if *link {
                std::os::unix::fs::symlink(source, target).map_err(|e| e.to_string())?;
            } else {
                std::fs::copy(source, target).map_err(|e| format!("copy {}: {e}", source.display()))?;
            }
        }
        Ok(())
    })();
    if let Err(e) = result {
        restore_overrides(journal);
        return Err(e);
    }
    Ok(true)
}

/// Undo everything recorded in the journal (also called at startup for crash recovery).
pub fn restore_overrides(journal: &Path) {
    let Ok(text) = std::fs::read_to_string(journal) else { return };
    let entries: Vec<JournalEntry> = serde_json::from_str(&text).unwrap_or_default();
    for e in entries.iter().rev() {
        let target = PathBuf::from(&e.target);
        if target.is_symlink() || target.is_file() {
            let _ = std::fs::remove_file(&target);
        } else if target.is_dir() {
            log::warn!("Not removing directory override target {}", target.display());
            continue;
        }
        if e.had_original {
            if let Err(err) = std::fs::rename(backup_path(&target), &target) {
                log::error!("restore {}: {err}", target.display());
            }
        }
    }
    let _ = std::fs::remove_file(journal);
}

pub type RunningSlot = Mutex<Option<RunningGame>>;
