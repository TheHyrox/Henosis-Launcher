//! RetroAchievements integration (https://api-docs.retroachievements.org).
//!
//! Games are matched to RA either by ROM hash (MD5 of the file, works for most
//! cartridge systems) or by normalized title against the console's game list.
//! The resolved RA game id is cached in the `kv` table; the per-console game
//! list is cached for a week.

use std::process::Command;
use parking_lot::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::Db;

const API: &str = "https://retroachievements.org/API";
pub const BADGE_URL: &str = "https://media.retroachievements.org/Badge";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RaCredentials {
    pub username: String,
    pub api_key: String,
    /// Login token for in-emulator achievements (obtained with the password, which is never stored).
    pub token: String,
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

#[derive(Serialize, Deserialize, Default)]
struct GameListCache {
    fetched_at: i64,
    games: Vec<(i64, String, Vec<String>)>,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn game_list(db: &Mutex<Db>, c: &RaCredentials, console: u32) -> Result<GameListCache, String> {
    let key = format!("ra_gamelist_{console}");
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
            Some((id, title, hashes))
        })
        .collect();
    let cache = GameListCache { fetched_at: now(), games };
    let _ = db.lock().kv_set(&key, &cache);
    Ok(cache)
}

fn resolve_game_id(db: &Mutex<Db>, c: &RaCredentials, game_id: i64) -> Result<Option<i64>, String> {
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
        .and_then(|h| list.games.iter().find(|(_, _, hs)| hs.contains(&h)).map(|g| g.0));
    if found.is_none() {
        let want = normalize(&game.title);
        if !want.is_empty() {
            found = list.games.iter().find(|(_, t, _)| normalize(t) == want).map(|g| g.0);
        }
    }
    if let Some(id) = found {
        let _ = db.lock().kv_set(&kv_key, &Some(id));
    }
    Ok(found)
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

