//! Henosis Launcher – Rust backend entry point.

pub mod commands;
pub mod db;
pub mod emulators;
pub mod gamepad;
pub mod launcher;
pub mod metadata;
pub mod models;
pub mod platforms;
pub mod scanner;
pub mod settings;
pub mod sfo;
pub mod vdf;
pub mod window;
pub mod test_bridge;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use parking_lot::Mutex;
use tauri::{Manager, WindowEvent};

use crate::db::Db;
use crate::launcher::RunningSlot;
use crate::models::ScanDir;

pub struct AppState {
    pub db: Mutex<Db>,
    pub running: RunningSlot,
    pub visible: AtomicBool,
    pub focused: AtomicBool,
    pub guide_enabled: AtomicBool,
    pub data_dir: PathBuf,
}

/// First-run setup: seed common ROM directories and detect installed emulators.
fn bootstrap(db: &Db) {
    if db.kv_get::<bool>("bootstrapped").unwrap_or(false) {
        return;
    }
    if let Some(home) = dirs::home_dir() {
        for sub in ["ROMs", "roms", "Games/ROMs", "Emulation/roms"] {
            let p = home.join(sub);
            if p.is_dir() {
                let _ = db.save_scan_dir(&ScanDir {
                    path: p.to_string_lossy().to_string(),
                    platform: None,
                    enabled: true,
                });
            }
        }
    }
    for emu in emulators::detect(&[]) {
        let _ = db.save_emulator(&emu);
    }
    let _ = db.kv_set("bootstrapped", &true);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).try_init();

    let data_dir = if let Ok(d) = std::env::var("HENOSIS_DATA_DIR").or_else(|_| std::env::var("NEXUS_DATA_DIR")) {
        PathBuf::from(d)
    } else if let Some(local) = dirs::data_local_dir() {
        let p = local.join("henosis-launcher");
        if std::fs::create_dir_all(&p).is_ok() {
            p
        } else {
            PathBuf::from("/tmp/henosis-launcher")
        }
    } else {
        PathBuf::from("/tmp/henosis-launcher")
    };
    let _ = std::fs::create_dir_all(&data_dir);

    // Crash recovery for any per-game config overrides left over from an interrupted session.
    launcher::restore_overrides(&data_dir.join("restore-journal.json"));

    // Database configuration
    let db_path = data_dir.join("henosis.sqlite");
    let db = Db::open(&db_path).expect("open database");
    let _ = db.purge_missing();
    bootstrap(&db);
    let settings = db.app_settings();

    let bg_arg = std::env::args().any(|a| a == "--background" || a == "--hidden");
    let start_hidden = bg_arg || settings.start_hidden;

    let state = AppState {
        db: Mutex::new(db),
        running: Mutex::new(None),
        visible: AtomicBool::new(!start_hidden),
        focused: AtomicBool::new(!start_hidden),
        guide_enabled: AtomicBool::new(settings.guide_summons),
        data_dir,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show(app);
        }))
        .manage(state)
        .on_window_event(|w, ev| {
            let app = w.app_handle();
            let Some(state) = app.try_state::<AppState>() else { return };
            match ev {
                WindowEvent::Focused(f) => {
                    state.focused.store(*f, Ordering::Relaxed);
                    if *f {
                        state.visible.store(true, Ordering::Relaxed);
                    }
                }
                WindowEvent::CloseRequested { api, .. } => {
                    // Keep the process alive in the background so the Guide button continues to work.
                    api.prevent_close();
                    window::hide(app);
                }
                _ => {}
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            if start_hidden {
                window::hide(&handle);
            }
            test_bridge::start(handle.clone());
            gamepad::spawn(handle.clone());
            // Run an initial background scan so the library is up to date on launch.
            std::thread::spawn(move || {
                let state = handle.state::<AppState>();
                if let Err(e) = scanner::run(&state.db, |_, _, _| {}) {
                    log::warn!("initial scan: {e}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_platforms,
            commands::get_platform_defs,
            commands::get_games,
            commands::get_recent,
            commands::get_game,
            commands::save_game_settings,
            commands::set_game_flag,
            commands::rename_game,
            commands::set_game_platform,
            commands::delete_game,
            commands::purge_missing,
            commands::add_manual_game,
            commands::get_sessions,
            commands::fetch_game_metadata,
            commands::fetch_platform_metadata,
            commands::get_igdb_credentials,
            commands::save_igdb_credentials,
            commands::scan_library,
            commands::get_scan_dirs,
            commands::save_scan_dir,
            commands::remove_scan_dir,
            commands::get_emulators,
            commands::get_presets,
            commands::detect_emulators,
            commands::save_emulator,
            commands::delete_emulator,
            commands::get_cores,
            commands::get_emulator_dirs,
            commands::set_emulator_dirs,
            commands::get_platform_config,
            commands::save_platform_config,
            commands::launch_game,
            commands::stop_game,
            commands::get_running,
            commands::resume_game,
            commands::preview_launch,
            commands::read_game_log,
            commands::capture_config,
            commands::list_dir,
            commands::get_places,
            commands::get_app_settings,
            commands::save_app_settings,
            commands::hide_window,
            commands::quit_app,
            commands::report_test_state,
        ])
        .run(tauri::generate_context!())
        .expect("error running henosis launcher");
}
