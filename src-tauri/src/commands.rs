//! Tauri command handlers (the API used by the UI).

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::emulators::{self, Preset};
use crate::launcher::{self, RunningGame};
use crate::metadata::{self, IgdbCredentials};
use crate::models::*;
use crate::platforms::{self, Platform};
use crate::settings::{FileOverride, GameSettings};
use crate::{scanner, window, AppState};

type R<T> = Result<T, String>;

fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

// ── Platforms & games ──────────────────────────────────────────────────────

#[tauri::command]
pub fn get_platforms(state: State<AppState>, include_empty: bool) -> R<Vec<PlatformSummary>> {
    let db = state.db.lock();
    let stats = db.platform_stats().map_err(e)?;
    let mut out = Vec::new();
    for p in platforms::PLATFORMS {
        let (count, last) = stats
            .iter()
            .find(|(id, _, _)| id == p.id)
            .map(|(_, c, l)| (*c, *l))
            .unwrap_or((0, None));
        if count == 0 && !include_empty {
            continue;
        }
        let cfg = db.platform_config(p.id).map_err(e)?;
        out.push(PlatformSummary { platform: p.clone(), game_count: count, last_played: last, default_emulator: cfg.default_emulator });
    }
    Ok(out)
}

#[tauri::command]
pub fn get_platform_defs() -> Vec<Platform> {
    platforms::PLATFORMS.to_vec()
}

#[tauri::command]
pub fn get_games(state: State<AppState>, platform: Option<String>) -> R<Vec<Game>> {
    state.db.lock().games(platform.as_deref()).map_err(e)
}

#[tauri::command]
pub fn get_recent(state: State<AppState>, limit: i64) -> R<Vec<Game>> {
    state.db.lock().recent_games(limit).map_err(e)
}

#[tauri::command]
pub fn get_game(state: State<AppState>, id: i64) -> R<Game> {
    state.db.lock().game(id).map_err(e)?.ok_or_else(|| "Game not found".into())
}

#[tauri::command]
pub fn save_game_settings(state: State<AppState>, id: i64, settings: GameSettings) -> R<()> {
    state.db.lock().set_game_settings(id, &settings).map_err(e)
}

#[tauri::command]
pub fn set_game_flag(state: State<AppState>, id: i64, flag: String, value: bool) -> R<()> {
    state.db.lock().set_flag(id, &flag, value).map_err(e)
}

#[tauri::command]
pub fn rename_game(state: State<AppState>, id: i64, title: String) -> R<()> {
    state.db.lock().rename_game(id, title.trim()).map_err(e)
}

#[tauri::command]
pub fn set_game_platform(state: State<AppState>, id: i64, platform: String) -> R<()> {
    platforms::get(&platform).ok_or("Unknown platform")?;
    state.db.lock().set_game_platform(id, &platform).map_err(e)
}

#[tauri::command]
pub fn delete_game(state: State<AppState>, id: i64) -> R<()> {
    state.db.lock().delete_game(id).map_err(e)
}

#[tauri::command]
pub fn purge_missing(state: State<AppState>) -> R<usize> {
    state.db.lock().purge_missing().map_err(e)
}

#[tauri::command]
pub fn add_manual_game(state: State<AppState>, path: String, title: Option<String>, platform: String) -> R<i64> {
    platforms::get(&platform).ok_or("Unknown platform")?;
    let title = title.filter(|t| !t.trim().is_empty()).unwrap_or_else(|| {
        let stem = Path::new(&path).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        scanner::roms::clean_title(&stem).0
    });
    state.db.lock().insert_manual(&platform, &title, &path).map_err(e)
}

#[tauri::command]
pub fn get_sessions(state: State<AppState>, id: i64) -> R<Vec<Session>> {
    state.db.lock().sessions(id).map_err(e)
}

#[tauri::command]
pub async fn fetch_game_metadata(
    app: AppHandle,
    id: i64,
    force: Option<bool>,
    query: Option<String>,
) -> R<Game> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        metadata::fetch_for_game_opts(&state.db, id, force.unwrap_or(false), query.as_deref())
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub async fn search_metadata_candidates(
    app: AppHandle,
    id: i64,
    query: Option<String>,
) -> R<Vec<MetadataCandidate>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        metadata::search_candidates(&state.db, id, query)
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub async fn apply_metadata_candidate(
    app: AppHandle,
    id: i64,
    candidate: MetadataCandidate,
) -> R<Game> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        metadata::apply_candidate(&state.db, id, candidate)
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub fn update_game_metadata(state: State<AppState>, id: i64, patch: GameMetadataUpdate) -> R<Game> {
    metadata::update_manual_metadata(&state.db, id, patch)
}

#[tauri::command]
pub async fn reset_game_metadata(app: AppHandle, id: i64, rescrape: bool) -> R<Game> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        metadata::reset_metadata(&state.db, id, rescrape)
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub async fn fetch_platform_metadata(app: AppHandle, platform: String) -> R<usize> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let games = state.db.lock().games(Some(&platform)).map_err(e)?;
        let mut updated = 0;
        for g in games {
            let already = g.metadata.get("scrapedAt").is_some();
            if !already || g.cover.is_none() || g.metadata.get("description").is_none() {
                if metadata::fetch_for_game(&state.db, g.id).is_ok() {
                    updated += 1;
                }
            }
        }
        Ok(updated)
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub fn get_igdb_credentials(state: State<AppState>) -> IgdbCredentials {
    state.db.lock().kv_get("igdb_credentials").unwrap_or_default()
}

#[tauri::command]
pub fn save_igdb_credentials(state: State<AppState>, mut creds: IgdbCredentials) -> R<()> {
    creds.access_token = None;
    state.db.lock().kv_set("igdb_credentials", &creds).map_err(e)
}

// ── RetroAchievements ──────────────────────────────────────────────────────

#[tauri::command]
pub fn get_ra_credentials(state: State<AppState>) -> crate::retroachievements::RaCredentials {
    state.db.lock().kv_get("ra_credentials").unwrap_or_default()
}

#[tauri::command]
pub fn save_ra_credentials(state: State<AppState>, mut creds: crate::retroachievements::RaCredentials) -> R<()> {
    creds.username = creds.username.trim().to_string();
    creds.api_key = creds.api_key.trim().to_string();
    // The token is managed by `ra_login`; keep it unless the username changed.
    let prev: crate::retroachievements::RaCredentials = state.db.lock().kv_get("ra_credentials").unwrap_or_default();
    creds.token = if prev.username == creds.username { prev.token } else { String::new() };
    state.db.lock().kv_set("ra_credentials", &creds).map_err(e)
}

/// Log in with the RA password to obtain an emulator token. The password is not stored.
#[tauri::command]
pub async fn ra_login(app: AppHandle, username: String, password: String) -> R<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let username = username.trim().to_string();
        let token = crate::retroachievements::login(&username, &password)?;
        let state = app.state::<AppState>();
        let db = state.db.lock();
        let mut creds: crate::retroachievements::RaCredentials = db.kv_get("ra_credentials").unwrap_or_default();
        creds.username = username;
        creds.token = token;
        db.kv_set("ra_credentials", &creds).map_err(e)
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub async fn test_ra_credentials(creds: crate::retroachievements::RaCredentials) -> R<String> {
    tauri::async_runtime::spawn_blocking(move || crate::retroachievements::test_credentials(&creds))
        .await
        .map_err(e)?
}

#[tauri::command]
pub async fn get_ra_achievements(
    app: AppHandle,
    game_id: i64,
    refresh: bool,
) -> R<crate::retroachievements::RaGameResult> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        crate::retroachievements::game_achievements(&state.db, game_id, refresh)
    })
    .await
    .map_err(e)
}

// ── Scanning ───────────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
struct ScanProgress<'a> {
    phase: &'a str,
    count: usize,
    current: &'a str,
}

#[tauri::command]
pub async fn scan_library(app: AppHandle) -> R<ScanReport> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut last = std::time::Instant::now();
        let report = scanner::run(&state.db, |phase, count, current| {
            if last.elapsed().as_millis() > 80 {
                last = std::time::Instant::now();
                let _ = app.emit("scan-progress", ScanProgress { phase, count, current });
            }
        });
        report.map_err(e)
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub fn get_scan_dirs(state: State<AppState>) -> R<Vec<ScanDir>> {
    state.db.lock().scan_dirs().map_err(e)
}

#[tauri::command]
pub fn save_scan_dir(state: State<AppState>, dir: ScanDir) -> R<()> {
    if !Path::new(&dir.path).is_dir() {
        return Err("Not a directory".into());
    }
    state.db.lock().save_scan_dir(&dir).map_err(e)
}

#[tauri::command]
pub fn remove_scan_dir(state: State<AppState>, path: String) -> R<()> {
    state.db.lock().remove_scan_dir(&path).map_err(e)
}

// ── Emulators ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_emulators(state: State<AppState>) -> R<Vec<Emulator>> {
    state.db.lock().emulators().map_err(e)
}

#[tauri::command]
pub fn get_presets() -> Vec<Preset> {
    emulators::PRESETS.to_vec()
}

/// Detect emulators and add any not yet configured. Returns the newly added ones.
#[tauri::command]
pub async fn detect_emulators(app: AppHandle) -> R<Vec<Emulator>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let dirs: Vec<String> = state.db.lock().kv_get("emulator_dirs").unwrap_or_default();
        let found = emulators::detect(&dirs);
        let db = state.db.lock();
        let existing = db.emulators().map_err(e)?;
        let mut added = Vec::new();
        for emu in found {
            if !existing.iter().any(|x| x.exec == emu.exec || x.id == emu.id) {
                db.save_emulator(&emu).map_err(e)?;
                added.push(emu);
            }
        }
        Ok(added)
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub fn save_emulator(state: State<AppState>, mut emulator: Emulator) -> R<Emulator> {
    if emulator.id.is_empty() {
        emulator.id = format!("{}-{}", emulator.preset, crate::db::now());
    }
    if emulator.kind != "flatpak" && !Path::new(&emulator.exec).exists() {
        return Err(format!("Executable not found: {}", emulator.exec));
    }
    state.db.lock().save_emulator(&emulator).map_err(e)?;
    Ok(emulator)
}

#[tauri::command]
pub fn delete_emulator(state: State<AppState>, id: String) -> R<()> {
    state.db.lock().delete_emulator(&id).map_err(e)
}

#[tauri::command]
pub fn get_cores(state: State<AppState>, emulator_id: String) -> R<Vec<String>> {
    let emu = state.db.lock().emulator(&emulator_id).map_err(e)?.ok_or("Emulator not found")?;
    Ok(emulators::installed_cores(&emu))
}

#[tauri::command]
pub fn get_emulator_dirs(state: State<AppState>) -> Vec<String> {
    state.db.lock().kv_get("emulator_dirs").unwrap_or_default()
}

#[tauri::command]
pub fn set_emulator_dirs(state: State<AppState>, dirs: Vec<String>) -> R<()> {
    state.db.lock().kv_set("emulator_dirs", &dirs).map_err(e)
}

#[tauri::command]
pub fn get_platform_config(state: State<AppState>, platform: String) -> R<PlatformConfig> {
    state.db.lock().platform_config(&platform).map_err(e)
}

#[tauri::command]
pub fn save_platform_config(state: State<AppState>, config: PlatformConfig) -> R<()> {
    state.db.lock().save_platform_config(&config).map_err(e)
}

// ── Launching ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn launch_game(app: AppHandle, id: i64) -> R<()> {
    tauri::async_runtime::spawn_blocking(move || launcher::launch(&app, id)).await.map_err(e)?
}

#[tauri::command]
pub fn stop_game(app: AppHandle, state: State<AppState>) -> R<()> {
    launcher::stop(&app, &state)
}

#[tauri::command]
pub fn get_running(state: State<AppState>) -> Option<RunningGame> {
    state.running.lock().clone()
}

#[tauri::command]
pub fn resume_game(app: AppHandle, state: State<AppState>) {
    let running = state.running.lock().clone();
    let pids: Vec<u32> = match running {
        Some(r) => match (r.pgid, r.steam_app_id) {
            (Some(pg), _) => vec![pg],
            (None, Some(appid)) => launcher::steam_pids(appid),
            _ => vec![],
        },
        None => vec![],
    };
    window::focus_pid(&app, &pids);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPreview {
    pub command: Option<String>,
    pub emulator: Option<Emulator>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn preview_launch(app: AppHandle, id: i64) -> R<LaunchPreview> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let game = state.db.lock().game(id).map_err(e)?.ok_or("Game not found")?;
        let settings = launcher::effective_settings(&state, &game);
        let emulator = launcher::resolve_emulator(&state, &game, &settings).ok().flatten();
        Ok(match launcher::build(&state, &game) {
            Ok(spec) => LaunchPreview { command: Some(spec.display()), emulator, error: None },
            Err(err) => LaunchPreview { command: None, emulator, error: Some(err) },
        })
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub fn read_game_log(state: State<AppState>, id: i64) -> String {
    std::fs::read_to_string(state.data_dir.join("logs").join(format!("game-{id}.log"))).unwrap_or_default()
}

/// Copy an emulator config file into the launcher's per-game store and register it as an override.
#[tauri::command]
pub fn capture_config(state: State<AppState>, id: i64, target: String) -> R<GameSettings> {
    let src = PathBuf::from(&target);
    if !src.is_file() {
        return Err("Config file not found".into());
    }
    let dir = state.data_dir.join("game-configs").join(id.to_string());
    std::fs::create_dir_all(&dir).map_err(e)?;
    let dest = dir.join(src.file_name().ok_or("Invalid file")?);
    std::fs::copy(&src, &dest).map_err(e)?;
    let db = state.db.lock();
    let mut game = db.game(id).map_err(e)?.ok_or("Game not found")?;
    let mut list = game.settings.config_overrides.take().unwrap_or_default();
    list.retain(|o| o.target != target);
    list.push(FileOverride { source: dest.to_string_lossy().to_string(), target });
    game.settings.config_overrides = Some(list);
    db.set_game_settings(id, &game.settings).map_err(e)?;
    Ok(game.settings)
}

// ── File browser (controller-friendly path picking) ────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub path: String,
    pub parent: Option<String>,
    pub entries: Vec<DirEntry>,
}

#[tauri::command]
pub fn list_dir(path: Option<String>, show_files: bool, show_hidden: bool) -> R<DirListing> {
    let path = path.map(PathBuf::from).or_else(dirs::home_dir).ok_or("No home directory")?;
    let rd = std::fs::read_dir(&path).map_err(e)?;
    let mut entries: Vec<DirEntry> = rd
        .flatten()
        .filter_map(|d| {
            let name = d.file_name().to_string_lossy().to_string();
            if !show_hidden && name.starts_with('.') {
                return None;
            }
            let p = d.path();
            let is_dir = p.is_dir();
            if !is_dir && !show_files {
                return None;
            }
            let size = if is_dir { 0 } else { d.metadata().map(|m| m.len()).unwrap_or(0) };
            Some(DirEntry { name, path: p.to_string_lossy().to_string(), is_dir, size })
        })
        .collect();
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(DirListing {
        path: path.to_string_lossy().to_string(),
        parent: path.parent().map(|p| p.to_string_lossy().to_string()),
        entries,
    })
}

#[derive(Serialize)]
pub struct Place {
    pub name: String,
    pub path: String,
}

#[tauri::command]
pub fn get_places() -> Vec<Place> {
    let mut out = Vec::new();
    if let Some(h) = dirs::home_dir() {
        out.push(Place { name: "Home".into(), path: h.to_string_lossy().to_string() });
        for d in ["Games", "ROMs", "roms", "Emulation", "Emulators", "Downloads", "Applications"] {
            let p = h.join(d);
            if p.is_dir() {
                out.push(Place { name: d.into(), path: p.to_string_lossy().to_string() });
            }
        }
    }
    let user = std::env::var("USER").unwrap_or_default();
    for base in [format!("/run/media/{user}"), "/mnt".into(), "/media".into()] {
        if let Ok(rd) = std::fs::read_dir(&base) {
            for d in rd.flatten().filter(|d| d.path().is_dir()) {
                out.push(Place { name: d.file_name().to_string_lossy().to_string(), path: d.path().to_string_lossy().to_string() });
            }
        }
    }
    out.push(Place { name: "Root".into(), path: "/".into() });
    out
}

// ── App settings & window ──────────────────────────────────────────────────

#[tauri::command]
pub fn get_app_settings(state: State<AppState>) -> AppSettings {
    state.db.lock().app_settings()
}

#[tauri::command]
pub fn save_app_settings(state: State<AppState>, settings: AppSettings) -> R<()> {
    state.guide_enabled.store(settings.guide_summons, Ordering::Relaxed);
    set_autostart(settings.autostart).map_err(e)?;
    state.db.lock().kv_set("app_settings", &settings).map_err(e)
}

fn set_autostart(enabled: bool) -> std::io::Result<()> {
    let Some(cfg) = dirs::config_dir() else { return Ok(()) };
    let file = cfg.join("autostart/henosis-launcher.desktop");
    if enabled {
        std::fs::create_dir_all(file.parent().unwrap())?;
        let exe = std::env::current_exe()?;
        std::fs::write(
            &file,
            format!(
                "[Desktop Entry]\nType=Application\nName=Henosis Launcher\nExec=\"{}\" --background\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n",
                exe.display()
            ),
        )?;
    } else if file.exists() {
        std::fs::remove_file(file)?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: AppHandle) {
    window::hide(&app);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn report_test_state(state: serde_json::Value) {
    crate::test_bridge::set_latest_state(state);
}
