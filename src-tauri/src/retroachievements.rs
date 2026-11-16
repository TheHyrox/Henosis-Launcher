//! RetroAchievements integration (https://api-docs.retroachievements.org).
//!
//! Games are matched to RA either by ROM hash (MD5 of the file, works for most
//! cartridge systems) or by normalized title against the console's game list.
//! The resolved RA game id is cached in the `kv` table; the per-console game
//! list is cached for a week.

use std::process::Command;
use parking_lot::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::Db;
use crate::models::Game;

const API: &str = "https://retroachievements.org/API";
const MEDIA: &str = "https://media.retroachievements.org";
pub const BADGE_URL: &str = "https://media.retroachievements.org/Badge";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RaCredentials {
    pub username: String,
    pub api_key: String,
    /// Login token for in-emulator achievements (obtained with the password, which is never stored).
    pub token: String,
    #[serde(default = "default_hardcore")]
    pub hardcore: bool,
}

fn default_hardcore() -> bool {
    true
}

impl Default for RaCredentials {
    fn default() -> Self {
        Self {
            username: String::new(),
            api_key: String::new(),
            token: String::new(),
            hardcore: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RaAchievement {
    pub id: i64,
    pub title: String,
    pub desc: String,
    pub points: i64,
    pub badge_url: String,
    pub unlocked: bool,
    pub hardcore: bool,
    pub unlocked_at: Option<String>,
    /// Percentage of players who earned it.
    pub rarity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RaGameResult {
    /// "ok" | "no_credentials" | "unsupported" | "no_match" | "error"
    pub status: String,
    pub message: Option<String>,
    pub ra_game_id: Option<i64>,
    pub title: Option<String>,
    pub icon_url: Option<String>,
    pub achievements: Vec<RaAchievement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RaGameCandidate {
    pub ra_game_id: i64,
    pub title: String,
    pub icon_url: Option<String>,
    pub num_achievements: i64,
    pub points: i64,
    pub is_hack: bool,
}

impl RaGameResult {
    fn status(s: &str, msg: Option<String>) -> Self {
        Self { status: s.into(), message: msg, ..Default::default() }
    }
}

/// Map Henosis platform ids to RetroAchievements console ids.
pub fn console_id(platform: &str) -> Option<u32> {
    Some(match platform {
        "megadrive" => 1,
        "n64" => 2,
        "snes" => 3,
        "gb" => 4,
        "gba" => 5,
        "gbc" => 6,
        "nes" => 7,
        "pcengine" => 8,
        "segacd" => 9,
        "sega32x" => 10,
        "mastersystem" => 11,
        "psx" => 12,
        "lynx" => 13,
        "ngp" => 14,
        "gamegear" => 15,
        "gc" => 16,
        "jaguar" => 17,
        "nds" => 18,
        "ps2" => 21,
        "atari2600" => 25,
        "arcade" => 27,
        "virtualboy" => 28,
        "msx" => 29,
        "3do" => 43,
        "dreamcast" => 40,
        "saturn" => 39,
        "psp" => 41,
        "pokemini" => 24,
        "atari7800" => 51,
        "wonderswan" => 53,
        "pcenginecd" => 76,
        _ => return None,
    })
}

fn curl_json(url: &str) -> Result<Value, String> {
    let out = Command::new("curl")
        .args(["-sSL", "--max-time", "30", "-A", "HenosisLauncher/0.1", url])
        .output()
        .map_err(|e| format!("curl failed: {e}"))?;
    if !out.status.success() {
        return Err("Network request to RetroAchievements failed".into());
    }
    serde_json::from_slice(&out.stdout).map_err(|_| "Unexpected response from RetroAchievements".into())
}

fn enc(s: &str) -> String {
    let mut o = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => o.push(b as char),
            _ => o.push_str(&format!("%{:02X}", b)),
        }
    }
    o
}

fn auth(c: &RaCredentials) -> String {
    format!("z={}&y={}", enc(&c.username), enc(&c.api_key))
}

fn api_err(v: &Value) -> Option<String> {
    v.get("message")
        .or_else(|| v.get("error"))
        .or_else(|| v.get("Error"))
        .and_then(|m| m.as_str())
        .map(|s| s.to_string())
}

/// Exchange a password for an RA login token (used by emulators with native RA support).
pub fn login(username: &str, password: &str) -> Result<String, String> {
    let out = Command::new("curl")
        .args([
            "-sSL", "--max-time", "20", "-A", "HenosisLauncher/0.1",
            "--data-urlencode", "r=login2",
            "--data-urlencode", &format!("u={username}"),
            "--data-urlencode", &format!("p={password}"),
            "https://retroachievements.org/dorequest.php",
        ])
        .output()
        .map_err(|e| format!("curl failed: {e}"))?;
    let v: Value = serde_json::from_slice(&out.stdout).map_err(|_| "Unexpected response from RetroAchievements")?;
    if v.get("Success").and_then(|s| s.as_bool()) != Some(true) {
        return Err(api_err(&v).unwrap_or_else(|| "Login failed".into()));
    }
    v.get("Token").and_then(|t| t.as_str()).map(|t| t.to_string()).ok_or_else(|| "No token returned".into())
}

/// Verify credentials; returns the display name + points on success.
pub fn test_credentials(c: &RaCredentials) -> Result<String, String> {
    if c.username.is_empty() || c.api_key.is_empty() {
        return Err("Username and Web API key are required".into());
    }
    let v = curl_json(&format!("{API}/API_GetUserProfile.php?{}&u={}", auth(c), enc(&c.username)))?;
    if let Some(m) = api_err(&v) {
        return Err(m);
    }
    let user = v.get("User").and_then(|u| u.as_str()).unwrap_or(&c.username);
    let pts = v.get("TotalPoints").and_then(|p| p.as_i64()).unwrap_or(0);
    Ok(format!("{user} · {pts} points"))
}

fn md5_of(path: &str) -> Option<String> {
    let len = std::fs::metadata(path).ok()?.len();
    if len == 0 || len > 512 * 1024 * 1024 || !std::path::Path::new(path).is_file() {
        return None;
    }
    let out = Command::new("md5sum").arg(path).output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    s.split_whitespace().next().map(|h| h.to_lowercase())
}

fn normalize(t: &str) -> String {
    // Drop bracketed tags, e.g. "(USA)" / "[!]", and ", The" style articles.
    let mut s = String::new();
    let mut depth = 0;
    for ch in t.chars() {
        match ch {
            '(' | '[' => depth += 1,
            ')' | ']' => depth = (depth - 1).max(0),
            c if depth == 0 => s.push(c),
            _ => {}
        }
    }
    let s = s.to_lowercase();
    let s = s.trim().trim_start_matches("the ").to_string();
    s.chars().filter(|c| c.is_alphanumeric()).collect()
}

#[derive(Serialize, Deserialize, Default, Clone)]
struct GameListEntry {
    id: i64,
    title: String,
    hashes: Vec<String>,
    icon: Option<String>,
    num_achievements: i64,
    points: i64,
}

#[derive(Serialize, Deserialize, Default)]
struct GameListCache {
    fetched_at: i64,
    games: Vec<GameListEntry>,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn media_url(path: Option<&str>) -> Option<String> {
    let p = path?.trim();
    if p.is_empty() || p == "/Images/000001.png" {
        return None;
    }
    if p.starts_with("http://") || p.starts_with("https://") {
        Some(p.to_string())
    } else if p.starts_with('/') {
        Some(format!("{MEDIA}{p}"))
    } else {
        Some(format!("{MEDIA}/{p}"))
    }
}

fn strip_ra_tags(title: &str) -> String {
    let mut s = title.trim();
    while s.starts_with('~') {
        if let Some(rest) = s[1..].find('~') {
            s = s[1 + rest + 1..].trim_start();
        } else {
            break;
        }
    }
    s.to_string()
}

fn game_list(db: &Mutex<Db>, c: &RaCredentials, console: u32) -> Result<GameListCache, String> {
    let key = format!("ra_gamelist_v2_{console}");
    if let Some(cache) = db.lock().kv_get::<GameListCache>(&key) {
        if now() - cache.fetched_at < 7 * 86400 && !cache.games.is_empty() {
            return Ok(cache);
        }
    }
    let v = curl_json(&format!("{API}/API_GetGameList.php?{}&i={console}&f=1&h=1", auth(c)))?;
    if let Some(m) = api_err(&v) {
        return Err(m);
    }
    let arr = v.as_array().ok_or("Unexpected game list response")?;
    let games = arr
        .iter()
        .filter_map(|g| {
            let id = g.get("ID")?.as_i64()?;
            let title = g.get("Title")?.as_str()?.to_string();
            let hashes = g
                .get("Hashes")
                .and_then(|h| h.as_array())
                .map(|a| a.iter().filter_map(|h| h.as_str().map(|s| s.to_lowercase())).collect())
                .unwrap_or_default();
            let icon = media_url(g.get("ImageIcon").and_then(|i| i.as_str()));
            let num_achievements = g.get("NumAchievements").and_then(|n| n.as_i64()).unwrap_or(0);
            let points = g.get("Points").and_then(|n| n.as_i64()).unwrap_or(0);
            Some(GameListEntry { id, title, hashes, icon, num_achievements, points })
        })
        .collect();
    let cache = GameListCache { fetched_at: now(), games };
    let _ = db.lock().kv_set(&key, &cache);
    Ok(cache)
}

fn resolve_game_id(db: &Mutex<Db>, c: &RaCredentials, game_id: i64) -> Result<Option<i64>, String> {
    let manual_key = format!("ra_game_manual_{game_id}");
    if let Some(id) = db.lock().kv_get::<i64>(&manual_key) {
        return Ok(Some(id));
    }
    let kv_key = format!("ra_game_{game_id}");
    let game = db
        .lock()
        .game(game_id)
        .map_err(|e| e.to_string())?
        .ok_or("Game not found")?;
    if let Some(Some(id)) = db.lock().kv_get::<Option<i64>>(&kv_key) {
        return Ok(Some(id));
    }
    let Some(console) = console_id(&game.platform) else { return Ok(None) };
    let list = game_list(db, c, console)?;

    let mut found = md5_of(&game.path)
        .and_then(|h| list.games.iter().find(|g| g.hashes.contains(&h)).map(|g| g.id));
    if found.is_none() {
        let want = normalize(&game.title);
        if !want.is_empty() {
            found = list.games.iter().find(|g| normalize(&g.title) == want).map(|g| g.id);
        }
    }
    if let Some(id) = found {
        let _ = db.lock().kv_set(&kv_key, &Some(id));
    }
    Ok(found)
}

/// Search RetroAchievements games for a given library game's platform (or by numeric RA Game ID).
pub fn search_games(db: &Mutex<Db>, game_id: i64, query: &str) -> Result<Vec<RaGameCandidate>, String> {
    let creds: RaCredentials = db.lock().kv_get("ra_credentials").unwrap_or_default();
    if creds.username.is_empty() || creds.api_key.is_empty() {
        return Err("Add your RetroAchievements username and Web API key in Settings first.".into());
    }
    let game = db
        .lock()
        .game(game_id)
        .map_err(|e| e.to_string())?
        .ok_or("Game not found")?;
    let console = console_id(&game.platform)
        .ok_or_else(|| format!("RetroAchievements does not support {}", game.platform))?;
    let list = game_list(db, &creds, console)?;

    let q_trim = query.trim();
    if let Ok(id_query) = q_trim.parse::<i64>() {
        if let Some(g) = list.games.iter().find(|g| g.id == id_query) {
            return Ok(vec![RaGameCandidate {
                ra_game_id: g.id,
                title: g.title.clone(),
                icon_url: g.icon.clone(),
                num_achievements: g.num_achievements,
                points: g.points,
                is_hack: g.title.contains("~Hack~"),
            }]);
        }
        // Direct lookup via API_GetGameExtended in case it's a subset or unlisted ID
        let v = curl_json(&format!("{API}/API_GetGameExtended.php?{}&i={id_query}", auth(&creds)))?;
        if let Some(id) = v.get("ID").and_then(|x| x.as_i64()) {
            let title = v.get("Title").and_then(|t| t.as_str()).unwrap_or("").to_string();
            if !title.is_empty() {
                return Ok(vec![RaGameCandidate {
                    ra_game_id: id,
                    title: title.clone(),
                    icon_url: media_url(v.get("ImageIcon").and_then(|i| i.as_str())),
                    num_achievements: v.get("NumAchievements").and_then(|n| n.as_i64()).unwrap_or(0),
                    points: 0,
                    is_hack: title.contains("~Hack~"),
                }]);
            }
        }
        return Ok(Vec::new());
    }

    let q_lower = q_trim.to_lowercase();
    let tokens: Vec<String> = q_lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect();
    let q_norm = normalize(q_trim);

    let mut scored: Vec<(i32, &GameListEntry)> = list
        .games
        .iter()
        .filter_map(|g| {
            let clean = strip_ra_tags(&g.title);
            let clean_lower = clean.to_lowercase();
            let title_lower = g.title.to_lowercase();
            let clean_norm = normalize(&clean);

            if tokens.is_empty() {
                return Some((1, g));
            }
            let score = if clean_norm == q_norm && !q_norm.is_empty() {
                1000
            } else if clean_lower.starts_with(&q_lower) {
                700
            } else if clean_lower.contains(&q_lower) || title_lower.contains(&q_lower) {
                500
            } else if tokens.iter().all(|tok| title_lower.contains(tok.as_str())) {
                300 + (tokens.len() as i32 * 20)
            } else {
                let matched = tokens.iter().filter(|tok| title_lower.contains(tok.as_str())).count();
                if tokens.len() >= 2 && matched * 2 >= tokens.len() {
                    (matched as i32) * 50
                } else {
                    return None;
                }
            };
            Some((score, g))
        })
        .collect();

    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| b.1.num_achievements.cmp(&a.1.num_achievements))
            .then_with(|| a.1.title.cmp(&b.1.title))
    });
    scored.truncate(40);

    Ok(scored
        .into_iter()
        .map(|(_, g)| RaGameCandidate {
            ra_game_id: g.id,
            title: g.title.clone(),
            icon_url: g.icon.clone(),
            num_achievements: g.num_achievements,
            points: g.points,
            is_hack: g.title.contains("~Hack~"),
        })
        .collect())
}

/// Manually link a library game to a specific RetroAchievements game ID and optionally apply its metadata & artwork.
pub fn apply_ra_match(
    db: &Mutex<Db>,
    game_id: i64,
    ra_game_id: i64,
    apply_metadata: bool,
) -> Result<Game, String> {
    let creds: RaCredentials = db.lock().kv_get("ra_credentials").unwrap_or_default();
    if creds.username.is_empty() || creds.api_key.is_empty() {
        return Err("RetroAchievements credentials are not configured".into());
    }

    let game = db
        .lock()
        .game(game_id)
        .map_err(|e| e.to_string())?
        .ok_or("Game not found")?;

    {
        let lock = db.lock();
        let _ = lock.kv_set(&format!("ra_game_manual_{game_id}"), &ra_game_id);
        let _ = lock.kv_set(&format!("ra_game_{game_id}"), &Some(ra_game_id));
    }

    if !apply_metadata {
        return Ok(game);
    }

    let v = curl_json(&format!("{API}/API_GetGameExtended.php?{}&i={ra_game_id}", auth(&creds)))?;
    if let Some(m) = api_err(&v) {
        return Err(m);
    }

    let raw_title = v.get("Title").and_then(|t| t.as_str()).unwrap_or("").trim();
    let cleaned_title = strip_ra_tags(raw_title);
    let final_title = if cleaned_title.is_empty() {
        game.title.clone()
    } else {
        cleaned_title
    };

    let str_field = |k: &str| -> Option<String> {
        v.get(k)
            .and_then(|x| x.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };

    let boxart = media_url(v.get("ImageBoxArt").and_then(|x| x.as_str()));
    let title_img = media_url(v.get("ImageTitle").and_then(|x| x.as_str()));
    let ingame = media_url(v.get("ImageIngame").and_then(|x| x.as_str()));
    let icon = media_url(v.get("ImageIcon").and_then(|x| x.as_str()));

    let final_cover = boxart.or_else(|| title_img.clone()).or(icon).or(game.cover.clone());
    let final_hero = ingame.or(title_img).or(game.hero.clone());

    let mut meta = if game.metadata.is_object() {
        game.metadata.clone()
    } else {
        json!({})
    };
    if let Some(dev) = str_field("Developer") {
        meta["developer"] = json!(dev);
    }
    if let Some(pub_) = str_field("Publisher") {
        meta["publisher"] = json!(pub_);
    }
    if let Some(gen) = str_field("Genre") {
        meta["genre"] = json!(gen);
    }
    if let Some(rel) = str_field("Released") {
        meta["releaseDate"] = json!(rel);
    }
    if let Some(h) = &final_hero {
        meta["screenshots"] = json!([h]);
    }
    meta["raGameId"] = json!(ra_game_id);
    meta["titleLocked"] = json!(1);
    meta["metadataLocked"] = json!(1);
    meta["scrapedAt"] = json!(crate::db::now());

    let lock = db.lock();
    lock.set_game_full_metadata(
        game.id,
        &final_title,
        &game.platform,
        game.steam_app_id,
        game.serial.as_deref(),
        game.region.as_deref(),
        final_cover.as_deref(),
        final_hero.as_deref(),
        game.logo.as_deref(),
        &meta,
    )
    .map_err(|e| e.to_string())?;

    lock.game(game.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Game not found after update".into())
}

/// Remove a manual RetroAchievements link so auto-matching can run again.
pub fn unlink_ra_game(db: &Mutex<Db>, game_id: i64) -> Result<(), String> {
    let lock = db.lock();
    let _ = lock.conn.execute(
        "DELETE FROM kv WHERE key IN (?1, ?2)",
        rusqlite::params![format!("ra_game_manual_{game_id}"), format!("ra_game_{game_id}")],
    );
    Ok(())
}

/// If the game was manually linked to an RA Game ID (e.g. a translated ROM hack),
/// return one of its registered RA hashes so the emulator can load the exact achievement set.
pub fn manual_hash_for_game(db: &Mutex<Db>, game_id: i64, platform: &str) -> Option<String> {
    let ra_id = db.lock().kv_get::<i64>(&format!("ra_game_manual_{game_id}"))?;
    let console = console_id(platform)?;
    let key = format!("ra_gamelist_v2_{console}");
    if let Some(cache) = db.lock().kv_get::<GameListCache>(&key) {
        if let Some(entry) = cache.games.iter().find(|g| g.id == ra_id) {
            if let Some(h) = entry.hashes.first() {
                return Some(h.clone());
            }
        }
    }
    let creds: RaCredentials = db.lock().kv_get("ra_credentials").unwrap_or_default();
    if creds.username.is_empty() || creds.api_key.is_empty() {
        return None;
    }
    if let Ok(cache) = game_list(db, &creds, console) {
        if let Some(entry) = cache.games.iter().find(|g| g.id == ra_id) {
            if let Some(h) = entry.hashes.first() {
                return Some(h.clone());
            }
        }
    }
    // Fallback: query API_GetGameHashes.php?z=...&y=...&i={ra_id}
    let v = curl_json(&format!("{API}/API_GetGameHashes.php?{}&i={ra_id}", auth(&creds))).ok()?;
    v.get("Results")
        .and_then(|r| r.as_array())
        .and_then(|arr| arr.first())
        .and_then(|item| item.get("MD5"))
        .and_then(|m| m.as_str())
        .map(|s| s.to_lowercase())
}

/// Fetch achievements (with the user's progress) for a library game.
pub fn game_achievements(db: &Mutex<Db>, game_id: i64, refresh: bool) -> RaGameResult {
    let creds: RaCredentials = db
        .lock()
        .kv_get("ra_credentials")
        .unwrap_or_default();
    if creds.username.is_empty() || creds.api_key.is_empty() {
        return RaGameResult::status("no_credentials", None);
    }
    let platform = match db.lock().game(game_id) {
        Ok(Some(g)) => g.platform,
        Ok(None) => return RaGameResult::status("error", Some("Game not found".into())),
        Err(e) => return RaGameResult::status("error", Some(e.to_string())),
    };
    if console_id(&platform).is_none() {
        return RaGameResult::status("unsupported", None);
    }
    if refresh {
        let _ = db.lock().kv_set(&format!("ra_game_{game_id}"), &None::<i64>);
    }
    let ra_id = match resolve_game_id(db, &creds, game_id) {
        Ok(Some(id)) => id,
        Ok(None) => return RaGameResult::status("no_match", None),
        Err(e) => return RaGameResult::status("error", Some(e)),
    };
    let v = match curl_json(&format!(
        "{API}/API_GetGameInfoAndUserProgress.php?{}&u={}&g={ra_id}&a=1",
        auth(&creds),
        enc(&creds.username)
    )) {
        Ok(v) => v,
        Err(e) => return RaGameResult::status("error", Some(e)),
    };
    if let Some(m) = api_err(&v) {
        return RaGameResult::status("error", Some(m));
    }
    let players = v
        .get("NumDistinctPlayers")
        .or_else(|| v.get("NumDistinctPlayersCasual"))
        .and_then(|p| p.as_f64())
        .unwrap_or(0.0)
        .max(1.0);

    let mut achievements: Vec<RaAchievement> = v
        .get("Achievements")
        .and_then(|a| a.as_object())
        .map(|m| {
            m.values()
                .map(|a| {
                    let hc = a.get("DateEarnedHardcore").and_then(|d| d.as_str());
                    let casual = a.get("DateEarned").and_then(|d| d.as_str());
                    let earned = hc.or(casual).map(|s| s.to_string());
                    let badge = a.get("BadgeName").and_then(|b| b.as_str()).unwrap_or("00000");
                    let won = a
                        .get("NumAwarded")
                        .and_then(|n| n.as_f64())
                        .unwrap_or(0.0);
                    RaAchievement {
                        id: a.get("ID").and_then(|i| i.as_i64()).unwrap_or(0),
                        title: a.get("Title").and_then(|t| t.as_str()).unwrap_or("").into(),
                        desc: a.get("Description").and_then(|t| t.as_str()).unwrap_or("").into(),
                        points: a.get("Points").and_then(|p| p.as_i64()).unwrap_or(0),
                        badge_url: format!(
                            "{BADGE_URL}/{badge}{}.png",
                            if earned.is_some() { "" } else { "_lock" }
                        ),
                        unlocked: earned.is_some(),
                        hardcore: hc.is_some(),
                        unlocked_at: earned,
                        rarity: (won / players * 1000.0).round() / 10.0,
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    // Earned first (newest first), then locked by points ascending.
    achievements.sort_by(|a, b| match (a.unlocked, b.unlocked) {
        (true, true) => b.unlocked_at.cmp(&a.unlocked_at),
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        (false, false) => a.points.cmp(&b.points),
    });

    let icon = v.get("ImageIcon").and_then(|i| i.as_str()).map(|i| format!("https://media.retroachievements.org{i}"));
    RaGameResult {
        status: "ok".into(),
        message: None,
        ra_game_id: Some(ra_id),
        title: v.get("Title").and_then(|t| t.as_str()).map(|s| s.to_string()),
        icon_url: icon,
        achievements,
    }
}

