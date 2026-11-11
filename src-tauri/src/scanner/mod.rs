//! Library scanning orchestration.

pub mod roms;
pub mod steam;

use std::collections::HashSet;
use std::path::PathBuf;

use anyhow::Result;
use parking_lot::Mutex;

use crate::db::Db;
use crate::models::ScanReport;

/// Run a full scan. Filesystem work happens without holding the DB lock.
pub fn run(db: &Mutex<Db>, mut progress: impl FnMut(&str, usize, &str)) -> Result<ScanReport> {
    let (settings, dirs) = {
        let db = db.lock();
        (db.app_settings(), db.scan_dirs()?)
    };

    let mut report = ScanReport { added: 0, updated: 0, missing: 0, total: 0, errors: vec![] };

    // Steam
    let steam_games = if settings.steam_enabled {
        progress("steam", 0, "Reading Steam library…");
        steam::scan(settings.steam_path.as_deref())
    } else {
        vec![]
    };

    // ROMs
    let mut scanner = roms::RomScanner::new(settings.es_de_media_dir.as_ref().map(PathBuf::from));
    let rom_games = scanner.scan(&dirs, |n, title| progress("roms", n, title));
    report.errors.extend(scanner.errors);

    let db = db.lock();
    db.conn.execute_batch("BEGIN")?;
    for (source, list) in [("steam", &steam_games), ("rom", &rom_games)] {
        let mut seen = HashSet::new();
        for g in list.iter() {
            seen.insert(g.path.clone());
            match db.upsert_scanned(g) {
                Ok(true) => report.added += 1,
                Ok(false) => report.updated += 1,
                Err(e) => report.errors.push(format!("{}: {e}", g.path)),
            }
        }
        if source != "steam" || settings.steam_enabled {
            report.missing += db.mark_missing(source, &seen)?;
        }
    }
    report.missing += db.purge_missing()?;
    db.conn.execute_batch("COMMIT")?;
    report.total = steam_games.len() + rom_games.len();
    Ok(report)
}
