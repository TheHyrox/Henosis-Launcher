//! Steam achievements reader.
//!
//! Reads Steam's local binary VDF files in `<steam_root>/appcache/stats/`:
//! - `UserGameStatsSchema_<appid>.bin` for achievement definitions & icons
//! - `UserGameStats_<account_id>_<appid>.bin` for unlock state & timestamps
//! and enriches rarity percentages from Steam's public
//! `GetGlobalAchievementPercentagesForApp` endpoint (cached for 24h).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::Db;
use crate::scanner::steam::find_steam_root;
use crate::vdf;

const STEAM_ICON_CDN: &str = "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps";
const STEAMID64_BASE: u64 = 76561197960265728;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamAchievement {
    pub id: String,
    pub title: String,
    pub desc: String,
    pub icon_url: Option<String>,
    pub unlocked: bool,
    pub unlocked_at: Option<String>,
    pub unlock_time: Option<u64>,
    pub rarity: Option<f64>,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SteamAchievementsResult {
    /// "ok" | "no_schema" | "no_achievements" | "error"
    pub status: String,
    pub message: Option<String>,
    pub achievements: Vec<SteamAchievement>,
}

impl SteamAchievementsResult {
    fn status(s: &str, msg: Option<String>) -> Self {
        Self { status: s.into(), message: msg, achievements: Vec::new() }
    }
}

#[derive(Debug, Clone)]
enum Bvdf {
    Map(HashMap<String, Bvdf>),
    Str(String),
    I32(i32),
    F32(#[allow(dead_code)] f32),
    U64(u64),
}

impl Bvdf {
    fn as_map(&self) -> Option<&HashMap<String, Bvdf>> {
        match self {
            Bvdf::Map(m) => Some(m),
            _ => None,
        }
    }

    fn as_str(&self) -> Option<&str> {
        match self {
            Bvdf::Str(s) => Some(s.as_str()),
            _ => None,
        }
    }

    fn as_u64(&self) -> Option<u64> {
        match self {
            Bvdf::I32(v) => Some(*v as u32 as u64),
            Bvdf::U64(v) => Some(*v),
            Bvdf::Str(s) => s.parse::<u64>().ok(),
            _ => None,
        }
    }
}

fn read_cstr(data: &[u8], pos: &mut usize) -> Result<String, String> {
    let rel = data[*pos..]
        .iter()
        .position(|&b| b == 0)
        .ok_or_else(|| "Unexpected EOF in binary VDF string".to_string())?;
    let s = String::from_utf8_lossy(&data[*pos..*pos + rel]).to_string();
    *pos += rel + 1;
    Ok(s)
}

fn parse_bvdf_map(data: &[u8], pos: &mut usize, depth: usize) -> Result<HashMap<String, Bvdf>, String> {
    if depth > 32 {
        return Err("Binary VDF nesting too deep".into());
    }
    let mut map = HashMap::new();
    while *pos < data.len() {
        let tag = data[*pos];
        *pos += 1;
        if tag == 0x08 {
            return Ok(map);
        }
        let key = read_cstr(data, pos)?;
        let val = match tag {
            0x00 => Bvdf::Map(parse_bvdf_map(data, pos, depth + 1)?),
            0x01 => Bvdf::Str(read_cstr(data, pos)?),
            0x02 => {
                if *pos + 4 > data.len() {
                    return Err("Unexpected EOF in binary VDF i32".into());
                }
                let v = i32::from_le_bytes(data[*pos..*pos + 4].try_into().unwrap());
                *pos += 4;
                Bvdf::I32(v)
            }
            0x03 => {
                if *pos + 4 > data.len() {
                    return Err("Unexpected EOF in binary VDF f32".into());
                }
                let v = f32::from_le_bytes(data[*pos..*pos + 4].try_into().unwrap());
                *pos += 4;
                Bvdf::F32(v)
            }
            0x04 | 0x06 => {
                if *pos + 4 > data.len() {
                    return Err("Unexpected EOF in binary VDF 4-byte field".into());
                }
                let v = i32::from_le_bytes(data[*pos..*pos + 4].try_into().unwrap());
                *pos += 4;
                Bvdf::I32(v)
            }
            0x05 => {
                // Wide UTF-16LE null-terminated string
                let mut end = *pos;
                while end + 1 < data.len() && !(data[end] == 0 && data[end + 1] == 0) {
                    end += 2;
                }
                *pos = (end + 2).min(data.len());
                Bvdf::Str(String::new())
            }
            0x07 => {
                if *pos + 8 > data.len() {
                    return Err("Unexpected EOF in binary VDF u64".into());
                }
                let v = u64::from_le_bytes(data[*pos..*pos + 8].try_into().unwrap());
                *pos += 8;
                Bvdf::U64(v)
            }
            other => return Err(format!("Unsupported binary VDF tag 0x{other:02x}")),
        };
        map.insert(key, val);
    }
    Ok(map)
}

fn parse_bvdf(data: &[u8]) -> Result<HashMap<String, Bvdf>, String> {
    let mut pos = 0;
    parse_bvdf_map(data, &mut pos, 0)
}

fn localized_text(val: Option<&Bvdf>) -> Option<String> {
    match val? {
        Bvdf::Str(s) if !s.trim().is_empty() => Some(s.clone()),
        Bvdf::Map(m) => {
            if let Some(s) = m.get("english").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
                return Some(s.to_string());
            }
            m.iter()
                .filter(|(k, _)| k.as_str() != "token")
                .find_map(|(_, v)| v.as_str().filter(|s| !s.trim().is_empty()).map(|s| s.to_string()))
        }
        _ => None,
    }
}

fn active_account_id(steam_root: &Path) -> Option<u64> {
    let login_file = steam_root.join("config/loginusers.vdf");
    let text = std::fs::read_to_string(login_file).ok()?;
    let parsed = vdf::parse(&text);
    let users = parsed.get("users")?;
    for (steamid_str, entry) in users.entries() {
        if entry.str("MostRecent") == Some("1") {
            if let Ok(id64) = steamid_str.parse::<u64>() {
                if id64 > STEAMID64_BASE {
                    return Some(id64 - STEAMID64_BASE);
                }
            }
        }
    }
    None
}

fn find_user_stats_file(stats_dir: &Path, steam_root: &Path, appid: u32) -> Option<PathBuf> {
    if let Some(acc) = active_account_id(steam_root) {
        let exact = stats_dir.join(format!("UserGameStats_{acc}_{appid}.bin"));
        if exact.is_file() {
            return Some(exact);
        }
    }
    let suffix = format!("_{appid}.bin");
    let mut best: Option<(SystemTime, PathBuf)> = None;
    let Ok(entries) = std::fs::read_dir(stats_dir) else { return None };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("UserGameStats_") && name.ends_with(&suffix) {
            let mtime = entry
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(UNIX_EPOCH);
            if best.as_ref().map_or(true, |(t, _)| mtime > *t) {
                best = Some((mtime, entry.path()));
            }
        }
    }
    best.map(|(_, p)| p)
}

fn format_unix_date(ts: u64) -> String {
    // Howard Hinnant's civil_from_days algorithm (UTC date, YYYY-MM-DD).
    let days = (ts / 86_400) as i64;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = y + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}")
}

fn fetch_global_percentages(db: &Mutex<Db>, appid: u32, refresh: bool) -> HashMap<String, f64> {
    let cache_key = format!("steam_ach_pct:{appid}");
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    if !refresh {
        if let Some(cached) = db.lock().kv_get::<Value>(&cache_key) {
            let fetched_at = cached.get("fetchedAt").and_then(|v| v.as_u64()).unwrap_or(0);
            if now.saturating_sub(fetched_at) < 86_400 {
                if let Some(map) = cached.get("rates").and_then(|v| v.as_object()) {
                    return map
                        .iter()
                        .filter_map(|(k, v)| v.as_f64().map(|r| (k.clone(), r)))
                        .collect();
                }
            }
        }
    }

    let url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid={appid}"
    );
    let Ok(out) = Command::new("curl")
        .args(["-sSL", "--max-time", "5", "-A", "HenosisLauncher/0.1", &url])
        .output()
    else {
        return HashMap::new();
    };
    if !out.status.success() {
        return HashMap::new();
    }
    let Ok(json) = serde_json::from_slice::<Value>(&out.stdout) else {
        return HashMap::new();
    };
    let mut rates = HashMap::new();
    if let Some(arr) = json
        .get("achievementpercentages")
        .and_then(|v| v.get("achievements"))
        .and_then(|v| v.as_array())
    {
        for item in arr {
            let Some(name) = item.get("name").and_then(|v| v.as_str()) else { continue };
            let pct = item
                .get("percent")
                .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok())));
            if let Some(p) = pct {
                rates.insert(name.to_string(), (p * 10.0).round() / 10.0);
            }
        }
    }
    if !rates.is_empty() {
        let _ = db.lock().kv_set(
            &cache_key,
            &serde_json::json!({ "fetchedAt": now, "rates": rates }),
        );
    }
    rates
}

pub fn game_achievements(db: &Mutex<Db>, game_id: i64, refresh: bool) -> SteamAchievementsResult {
    let (game, custom_steam_root) = {
        let db = db.lock();
        let g = db.game(game_id);
        let s = db.app_settings();
        (g, s.steam_path)
    };
    let Ok(Some(game)) = game else {
        return SteamAchievementsResult::status("error", Some("Game not found".into()));
    };
    let Some(appid) = game.steam_app_id else {
        return SteamAchievementsResult::status("error", Some("Missing Steam App ID".into()));
    };
    let Some(steam_root) = find_steam_root(custom_steam_root.as_deref()) else {
        return SteamAchievementsResult::status(
            "no_schema",
            Some("Steam installation directory not found.".into()),
        );
    };

    let stats_dir = steam_root.join("appcache/stats");
    let schema_path = stats_dir.join(format!("UserGameStatsSchema_{appid}.bin"));
    let Ok(schema_bytes) = std::fs::read(&schema_path) else {
        return SteamAchievementsResult::status(
            "no_schema",
            Some("No local Steam achievement schema found yet. Launch the game once in Steam to cache its achievement list.".into()),
        );
    };
    let schema_root = match parse_bvdf(&schema_bytes) {
        Ok(m) => m,
        Err(e) => return SteamAchievementsResult::status("error", Some(format!("Failed to parse Steam schema: {e}"))),
    };

    let app_node = schema_root
        .get(&appid.to_string())
        .or_else(|| schema_root.values().next())
        .and_then(|v| v.as_map());
    let Some(stats_map) = app_node.and_then(|m| m.get("stats")).and_then(|v| v.as_map()) else {
        return SteamAchievementsResult::status("no_achievements", Some("This Steam game has no achievements.".into()));
    };

    // Parse user unlock state if available.
    let user_cache: HashMap<String, (u64, HashMap<u32, u64>)> =
        if let Some(user_path) = find_user_stats_file(&stats_dir, &steam_root, appid) {
            std::fs::read(user_path)
                .ok()
                .and_then(|b| parse_bvdf(&b).ok())
                .and_then(|root| root.get("cache").and_then(|v| v.as_map()).cloned())
                .map(|cache| {
                    cache
                        .into_iter()
                        .filter_map(|(stat_id, val)| {
                            let m = val.as_map()?;
                            let mask = m.get("data").and_then(|v| v.as_u64()).unwrap_or(0);
                            let mut times = HashMap::new();
                            if let Some(tmap) = m.get("AchievementTimes").and_then(|v| v.as_map()) {
                                for (bit_str, tv) in tmap {
                                    if let (Ok(bit), Some(ts)) = (bit_str.parse::<u32>(), tv.as_u64()) {
                                        if ts > 0 {
                                            times.insert(bit, ts);
                                        }
                                    }
                                }
                            }
                            Some((stat_id, (mask, times)))
                        })
                        .collect()
                })
                .unwrap_or_default()
        } else {
            HashMap::new()
        };

    let rarity_map = fetch_global_percentages(db, appid, refresh);

    let mut achievements = Vec::new();
    for (stat_id, stat_val) in stats_map {
        let Some(stat_map) = stat_val.as_map() else { continue };
        let stat_type = stat_map.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if !stat_type.eq_ignore_ascii_case("ACHIEVEMENTS") {
            continue;
        }
        let Some(bits) = stat_map.get("bits").and_then(|v| v.as_map()) else { continue };
        let (mask, times) = user_cache.get(stat_id).cloned().unwrap_or_default();

        for (bit_str, bit_val) in bits {
            let Ok(bit_idx) = bit_str.parse::<u32>() else { continue };
            let Some(bit_map) = bit_val.as_map() else { continue };
            let api_name = bit_map
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(bit_str)
                .to_string();
            let display = bit_map.get("display").and_then(|v| v.as_map());
            let hidden = display
                .and_then(|d| d.get("hidden"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
                != 0;
            let unlock_time = times.get(&bit_idx).copied();
            let unlocked = (bit_idx < 64 && ((mask >> bit_idx) & 1) != 0) || unlock_time.is_some();

            let title = localized_text(display.and_then(|d| d.get("name")))
                .unwrap_or_else(|| api_name.clone());
            let desc = localized_text(display.and_then(|d| d.get("desc")))
                .unwrap_or_else(|| if hidden && !unlocked { "Hidden achievement".into() } else { String::new() });

            let icon_hash = if unlocked {
                display.and_then(|d| d.get("icon")).and_then(|v| v.as_str())
            } else {
                display
                    .and_then(|d| d.get("icon_gray"))
                    .and_then(|v| v.as_str())
                    .or_else(|| display.and_then(|d| d.get("icon")).and_then(|v| v.as_str()))
            };
            let icon_url = icon_hash
                .filter(|h| !h.is_empty())
                .map(|h| format!("{STEAM_ICON_CDN}/{appid}/{h}"));

            let rarity = rarity_map.get(&api_name).copied();
            let unlocked_at = if unlocked {
                Some(
                    unlock_time
                        .map(format_unix_date)
                        .unwrap_or_else(|| "Unlocked".into()),
                )
            } else {
                None
            };

            achievements.push(SteamAchievement {
                id: api_name,
                title,
                desc,
                icon_url,
                unlocked,
                unlocked_at,
                unlock_time,
                rarity,
                hidden,
            });
        }
    }

    if achievements.is_empty() {
        return SteamAchievementsResult::status("no_achievements", Some("This Steam game has no achievements.".into()));
    }

    achievements.sort_by(|a, b| {
        b.unlocked
            .cmp(&a.unlocked)
            .then_with(|| b.unlock_time.unwrap_or(0).cmp(&a.unlock_time.unwrap_or(0)))
            .then_with(|| {
                b.rarity
                    .unwrap_or(-1.0)
                    .partial_cmp(&a.rarity.unwrap_or(-1.0))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| a.title.cmp(&b.title))
    });

    SteamAchievementsResult {
        status: "ok".into(),
        message: None,
        achievements,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_unix_dates() {
        assert_eq!(format_unix_date(0), "1970-01-01");
        assert_eq!(format_unix_date(1751648751), "2025-07-04");
    }

    #[test]
    fn parses_binary_vdf() {
        // Minimal map: { "1": { "name": "TEST", "hidden": 1 } }
        let mut buf = Vec::new();
        buf.push(0x00);
        buf.extend_from_slice(b"1\0");
        buf.push(0x01);
        buf.extend_from_slice(b"name\0TEST\0");
        buf.push(0x02);
        buf.extend_from_slice(b"hidden\0");
        buf.extend_from_slice(&1i32.to_le_bytes());
        buf.push(0x08);
        buf.push(0x08);

        let parsed = parse_bvdf(&buf).unwrap();
        let inner = parsed.get("1").unwrap().as_map().unwrap();
        assert_eq!(inner.get("name").unwrap().as_str(), Some("TEST"));
        assert_eq!(inner.get("hidden").unwrap().as_u64(), Some(1));
    }
}
