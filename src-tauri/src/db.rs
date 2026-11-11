//! SQLite persistence layer.

use std::path::Path;

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::models::*;
use crate::settings::GameSettings;

pub struct Db {
    pub conn: Connection,
}

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS games (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    platform      TEXT NOT NULL,
    title         TEXT NOT NULL,
    path          TEXT NOT NULL UNIQUE,
    source        TEXT NOT NULL,
    steam_app_id  INTEGER,
    region        TEXT,
    serial        TEXT,
    cover         TEXT,
    hero          TEXT,
    logo          TEXT,
    favorite      INTEGER NOT NULL DEFAULT 0,
    hidden        INTEGER NOT NULL DEFAULT 0,
    added_at      INTEGER NOT NULL,
    last_played   INTEGER,
    playtime      INTEGER NOT NULL DEFAULT 0,
    play_count    INTEGER NOT NULL DEFAULT 0,
    missing       INTEGER NOT NULL DEFAULT 0,
    file_size     INTEGER,
    settings      TEXT NOT NULL DEFAULT '{}',
    metadata      TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform);

CREATE TABLE IF NOT EXISTS scan_dirs (
    path      TEXT PRIMARY KEY,
    platform  TEXT,
    enabled   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS emulators (
    id    TEXT PRIMARY KEY,
    data  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_config (
    platform TEXT PRIMARY KEY,
    data     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id  INTEGER NOT NULL,
    started  INTEGER NOT NULL,
    ended    INTEGER NOT NULL,
    duration INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

const GAME_COLS: &str = "id, platform, title, path, source, steam_app_id, region, serial, cover, hero, logo, \
    favorite, hidden, added_at, last_played, playtime, play_count, missing, file_size, settings, metadata";

fn row_to_game(r: &Row) -> rusqlite::Result<Game> {
    let settings: String = r.get(19)?;
    let metadata: String = r.get(20)?;
    Ok(Game {
        id: r.get(0)?,
        platform: r.get(1)?,
        title: r.get(2)?,
        path: r.get(3)?,
        source: r.get(4)?,
        steam_app_id: r.get(5)?,
        region: r.get(6)?,
        serial: r.get(7)?,
        cover: r.get(8)?,
        hero: r.get(9)?,
        logo: r.get(10)?,
        favorite: r.get::<_, i64>(11)? != 0,
        hidden: r.get::<_, i64>(12)? != 0,
        added_at: r.get(13)?,
        last_played: r.get(14)?,
        playtime: r.get(15)?,
        play_count: r.get(16)?,
        missing: r.get::<_, i64>(17)? != 0,
        file_size: r.get(18)?,
        settings: serde_json::from_str(&settings).unwrap_or_default(),
        metadata: serde_json::from_str(&metadata).unwrap_or(serde_json::Value::Object(Default::default())),
    })
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn })
    }

    // ── Games ────────────────────────────────────────────────────────────

    pub fn games(&self, platform: Option<&str>) -> Result<Vec<Game>> {
        let sql = match platform {
            Some(_) => format!("SELECT {GAME_COLS} FROM games WHERE platform = ?1 AND missing = 0 ORDER BY title COLLATE NOCASE"),
            None => format!("SELECT {GAME_COLS} FROM games WHERE missing = 0 ORDER BY title COLLATE NOCASE"),
        };
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = match platform {
            Some(p) => stmt.query_map([p], row_to_game)?.collect::<rusqlite::Result<Vec<_>>>()?,
            None => stmt.query_map([], row_to_game)?.collect::<rusqlite::Result<Vec<_>>>()?,
        };
        Ok(rows)
    }

    pub fn recent_games(&self, limit: i64) -> Result<Vec<Game>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {GAME_COLS} FROM games WHERE last_played IS NOT NULL AND hidden = 0 AND missing = 0 \
             ORDER BY last_played DESC LIMIT ?1"
        ))?;
        let rows = stmt.query_map([limit], row_to_game)?.collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn game(&self, id: i64) -> Result<Option<Game>> {
        Ok(self
            .conn
            .query_row(&format!("SELECT {GAME_COLS} FROM games WHERE id = ?1"), [id], row_to_game)
            .optional()?)
    }

    /// Insert or refresh a scanned game. Returns `true` when newly added.
    pub fn upsert_scanned(&self, g: &ScannedGame) -> Result<bool> {
        let existing: Option<i64> = self
            .conn
            .query_row("SELECT id FROM games WHERE path = ?1", [&g.path], |r| r.get(0))
            .optional()?;
        match existing {
            Some(id) => {
                self.conn.execute(
                    "UPDATE games SET platform = ?2, steam_app_id = ?3, region = COALESCE(?4, region), \
                     serial = COALESCE(?5, serial), cover = COALESCE(?6, cover), hero = COALESCE(?7, hero), \
                     logo = COALESCE(?8, logo), file_size = ?9, missing = 0, \
                     title = CASE WHEN json_extract(metadata, '$.titleLocked') = 1 THEN title ELSE ?10 END \
                     WHERE id = ?1",
                    params![id, g.platform, g.steam_app_id, g.region, g.serial, g.cover, g.hero, g.logo, g.file_size, g.title],
                )?;
                Ok(false)
            }
            None => {
                let meta = g.metadata.clone().unwrap_or(serde_json::json!({}));
                self.conn.execute(
                    "INSERT INTO games (platform, title, path, source, steam_app_id, region, serial, cover, hero, logo, \
                     added_at, file_size, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                    params![g.platform, g.title, g.path, g.source, g.steam_app_id, g.region, g.serial, g.cover,
                        g.hero, g.logo, now(), g.file_size, meta.to_string()],
                )?;
                Ok(true)
            }
        }
    }

    /// Delete games of a given source whose path wasn't seen during the last scan,
    /// plus any ROMs that match update/DLC patterns or whose file no longer exists on disk.
    pub fn mark_missing(&self, source: &str, seen: &std::collections::HashSet<String>) -> Result<usize> {
        let mut stmt = self.conn.prepare("SELECT id, path FROM games WHERE source = ?1")?;
        let rows: Vec<(i64, String)> = stmt
            .query_map([source], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?;
        let mut n = 0;
        for (id, path) in rows {
            if !seen.contains(&path) {
                self.conn.execute("DELETE FROM games WHERE id = ?1", [id])?;
                n += 1;
            }
        }
        Ok(n)
    }

    /// Delete any entries flagged missing or whose local file no longer exists.
    pub fn purge_missing(&self) -> Result<usize> {
        let mut deleted = self.conn.execute("DELETE FROM games WHERE missing = 1", [])?;
        let mut stmt = self.conn.prepare("SELECT id, path, source FROM games")?;
        let rows: Vec<(i64, String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<rusqlite::Result<_>>()?;
        for (id, path, source) in rows {
            if source != "steam" {
                let p = std::path::Path::new(&path);
                let lname = p.file_name().map(|f| f.to_string_lossy().to_lowercase()).unwrap_or_default();
                let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
                if !p.exists() || crate::scanner::roms::is_update_or_dlc(&lname, &ext) {
                    self.conn.execute("DELETE FROM games WHERE id = ?1", [id])?;
                    deleted += 1;
                }
            }
        }
        Ok(deleted)
    }

    pub fn insert_manual(&self, platform: &str, title: &str, path: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO games (platform, title, path, source, added_at, metadata) VALUES (?1, ?2, ?3, 'manual', ?4, ?5)",
            params![platform, title, path, now(), serde_json::json!({"titleLocked": 1}).to_string()],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn delete_game(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM games WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn set_game_settings(&self, id: i64, s: &GameSettings) -> Result<()> {
        self.conn.execute("UPDATE games SET settings = ?2 WHERE id = ?1", params![id, serde_json::to_string(s)?])?;
        Ok(())
    }

    pub fn set_flag(&self, id: i64, column: &str, value: bool) -> Result<()> {
        let col = match column {
            "favorite" => "favorite",
            "hidden" => "hidden",
            _ => anyhow::bail!("unknown flag {column}"),
        };
        self.conn.execute(&format!("UPDATE games SET {col} = ?2 WHERE id = ?1"), params![id, value as i64])?;
        Ok(())
    }

    pub fn update_game_artwork_and_metadata(
        &self,
        id: i64,
        cover: Option<&str>,
        hero: Option<&str>,
        logo: Option<&str>,
        metadata: &serde_json::Value,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE games SET cover = COALESCE(?2, cover), hero = COALESCE(?3, hero), \
             logo = COALESCE(?4, logo), metadata = ?5 WHERE id = ?1",
            params![id, cover, hero, logo, metadata.to_string()],
        )?;
        Ok(())
    }

    pub fn rename_game(&self, id: i64, title: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE games SET title = ?2, metadata = json_set(metadata, '$.titleLocked', 1) WHERE id = ?1",
            params![id, title],
        )?;
        Ok(())
    }

    pub fn set_game_platform(&self, id: i64, platform: &str) -> Result<()> {
        self.conn.execute("UPDATE games SET platform = ?2 WHERE id = ?1", params![id, platform])?;
        Ok(())
    }

    pub fn record_session(&self, game_id: i64, started: i64, ended: i64) -> Result<()> {
        let duration = (ended - started).max(0);
        self.conn.execute(
            "INSERT INTO sessions (game_id, started, ended, duration) VALUES (?1, ?2, ?3, ?4)",
            params![game_id, started, ended, duration],
        )?;
        self.conn.execute(
            "UPDATE games SET last_played = ?2, playtime = playtime + ?3, play_count = play_count + 1 WHERE id = ?1",
            params![game_id, ended, duration],
        )?;
        Ok(())
    }

    pub fn sessions(&self, game_id: i64) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, game_id, started, ended, duration FROM sessions WHERE game_id = ?1 ORDER BY started DESC LIMIT 50",
        )?;
        let rows = stmt
            .query_map([game_id], |r| {
                Ok(Session { id: r.get(0)?, game_id: r.get(1)?, started: r.get(2)?, ended: r.get(3)?, duration: r.get(4)? })
            })?
            .collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    /// (platform, visible game count, last played)
    pub fn platform_stats(&self) -> Result<Vec<(String, i64, Option<i64>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT platform, COUNT(*), MAX(last_played) FROM games WHERE hidden = 0 AND missing = 0 GROUP BY platform",
        )?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    // ── Scan dirs ────────────────────────────────────────────────────────

    pub fn scan_dirs(&self) -> Result<Vec<ScanDir>> {
        let mut stmt = self.conn.prepare("SELECT path, platform, enabled FROM scan_dirs ORDER BY path")?;
        let rows = stmt
            .query_map([], |r| Ok(ScanDir { path: r.get(0)?, platform: r.get(1)?, enabled: r.get::<_, i64>(2)? != 0 }))?
            .collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    pub fn save_scan_dir(&self, d: &ScanDir) -> Result<()> {
        self.conn.execute(
            "INSERT INTO scan_dirs (path, platform, enabled) VALUES (?1, ?2, ?3) \
             ON CONFLICT(path) DO UPDATE SET platform = ?2, enabled = ?3",
            params![d.path, d.platform, d.enabled as i64],
        )?;
        Ok(())
    }

    pub fn remove_scan_dir(&self, path: &str) -> Result<()> {
        self.conn.execute("DELETE FROM scan_dirs WHERE path = ?1", [path])?;
        Ok(())
    }

    // ── Emulators ────────────────────────────────────────────────────────

    pub fn emulators(&self) -> Result<Vec<Emulator>> {
        let mut stmt = self.conn.prepare("SELECT data FROM emulators")?;
        let rows: Vec<String> = stmt.query_map([], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
        let mut list: Vec<Emulator> = rows.iter().filter_map(|s| serde_json::from_str(s).ok()).collect();
        list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(list)
    }

    pub fn emulator(&self, id: &str) -> Result<Option<Emulator>> {
        let data: Option<String> =
            self.conn.query_row("SELECT data FROM emulators WHERE id = ?1", [id], |r| r.get(0)).optional()?;
        Ok(data.and_then(|d| serde_json::from_str(&d).ok()))
    }

    pub fn save_emulator(&self, e: &Emulator) -> Result<()> {
        self.conn.execute(
            "INSERT INTO emulators (id, data) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET data = ?2",
            params![e.id, serde_json::to_string(e)?],
        )?;
        Ok(())
    }

    pub fn delete_emulator(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM emulators WHERE id = ?1", [id])?;
        Ok(())
    }

    // ── Platform config ──────────────────────────────────────────────────

    pub fn platform_config(&self, platform: &str) -> Result<PlatformConfig> {
        let data: Option<String> = self
            .conn
            .query_row("SELECT data FROM platform_config WHERE platform = ?1", [platform], |r| r.get(0))
            .optional()?;
        Ok(data
            .and_then(|d| serde_json::from_str(&d).ok())
            .unwrap_or(PlatformConfig { platform: platform.to_string(), ..Default::default() }))
    }

    pub fn save_platform_config(&self, c: &PlatformConfig) -> Result<()> {
        self.conn.execute(
            "INSERT INTO platform_config (platform, data) VALUES (?1, ?2) ON CONFLICT(platform) DO UPDATE SET data = ?2",
            params![c.platform, serde_json::to_string(c)?],
        )?;
        Ok(())
    }

    // ── Key/value ────────────────────────────────────────────────────────

    pub fn kv_get<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        let v: Option<String> =
            self.conn.query_row("SELECT value FROM kv WHERE key = ?1", [key], |r| r.get(0)).optional().ok()??;
        v.and_then(|s| serde_json::from_str(&s).ok())
    }

    pub fn kv_set<T: serde::Serialize>(&self, key: &str, value: &T) -> Result<()> {
        self.conn.execute(
            "INSERT INTO kv (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![key, serde_json::to_string(value)?],
        )?;
        Ok(())
    }

    pub fn app_settings(&self) -> AppSettings {
        self.kv_get("app_settings").unwrap_or_default()
    }
}
