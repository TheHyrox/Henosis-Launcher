//! Automatic metadata & boxart scraper:
//! 1. Steam Store API (`store.steampowered.com/api/appdetails`) for Steam games – fetches
//!    synopsis, developer, publisher, release date, genres, and screenshots with zero API keys.
//! 2. Libretro Thumbnails CDN (`thumbnails.libretro.com`) for retro & emulated console games –
//!    fetches official `Named_Boxarts`, `Named_Snaps`, and `Named_Titles` artwork.
//! 3. Optional IGDB API (via Twitch Client-ID + Client-Secret) for rich retro/emulated synopses,
//!    developers, publishers, genres, and release years.

use std::process::Command;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::Db;
use crate::models::Game;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IgdbCredentials {
    pub client_id: String,
    pub client_secret: String,
    pub access_token: Option<String>,
}

/// Map our internal platform IDs to Libretro Thumbnail repository directory names.
pub fn libretro_system_name(platform: &str) -> Option<&'static str> {
    Some(match platform {
        "nes" => "Nintendo - Nintendo Entertainment System",
        "snes" => "Nintendo - Super Nintendo Entertainment System",
        "n64" => "Nintendo - Nintendo 64",
        "gb" => "Nintendo - Game Boy",
        "gbc" => "Nintendo - Game Boy Color",
        "gba" => "Nintendo - Game Boy Advance",
        "nds" => "Nintendo - Nintendo DS",
        "n3ds" => "Nintendo - Nintendo 3DS",
        "gc" => "Nintendo - GameCube",
        "wii" => "Nintendo - Wii",
        "wiiu" => "Nintendo - Wii U",
        "switch" => "Nintendo - Switch",
        "virtualboy" => "Nintendo - Virtual Boy",
        "pokemini" => "Nintendo - Pokemon Mini",
        "psx" => "Sony - PlayStation",
        "ps2" => "Sony - PlayStation 2",
        "ps3" => "Sony - PlayStation 3",
        "psp" => "Sony - PlayStation Portable",
        "psvita" => "Sony - PlayStation Vita",
        "mastersystem" => "Sega - Master System - Mark III",
        "megadrive" => "Sega - Mega Drive - Genesis",
        "segacd" => "Sega - Mega-CD - Sega CD",
        "sega32x" => "Sega - 32X",
        "gamegear" => "Sega - Game Gear",
        "saturn" => "Sega - Saturn",
        "dreamcast" => "Sega - Dreamcast",
        "xbox" => "Microsoft - Xbox",
        "xbox360" => "Microsoft - Xbox 360",
        "arcade" => "MAME",
        "neogeo" => "SNK - Neo Geo",
        "ngp" => "SNK - Neo Geo Pocket Color",
        "pcengine" => "NEC - PC Engine - TurboGrafx 16",
        "pcenginecd" => "NEC - PC Engine CD - TurboGrafx-CD",
        "3do" => "The 3DO Company - 3DO",
        "atari2600" => "Atari - 2600",
        "atari7800" => "Atari - 7800",
        "lynx" => "Atari - Lynx",
        "jaguar" => "Atari - Jaguar",
        "wonderswan" => "Bandai - WonderSwan Color",
        "msx" => "Microsoft - MSX",
        "c64" => "Commodore - 64",
        _ => return None,
    })
}

/// Sanitize a title for Libretro Thumbnails lookup (`&*/:`"`<>?\|` replaced with `_`).
fn libretro_sanitize(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '&' | '*' | '/' | ':' | '`' | '<' | '>' | '?' | '\\' | '|' | '"' => '_',
            other => other,
        })
        .collect()
}

fn url_encode_path(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn curl_get_json(url: &str) -> Option<Value> {
    let out = Command::new("curl")
        .args(["-sSL", "--max-time", "8", url])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    serde_json::from_slice(&out.stdout).ok()
}

fn curl_head_ok(url: &str) -> bool {
    Command::new("curl")
        .args(["-sSL", "-I", "--max-time", "4", "-o", "/dev/null", "-w", "%{http_code}", url])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "200")
        .unwrap_or(false)
}

/// Fetch metadata & artwork for a single game and persist to SQLite.
pub fn fetch_for_game(db: &Mutex<Db>, game_id: i64) -> Result<Game, String> {
    let (game, igdb_creds) = {
        let lock = db.lock();
        let g = lock.game(game_id).map_err(|e| e.to_string())?.ok_or("Game not found")?;
        let creds: Option<IgdbCredentials> = lock.kv_get("igdb_credentials");
        (g, creds)
    };

    let mut meta = if game.metadata.is_object() { game.metadata.clone() } else { json!({}) };
    let mut new_cover: Option<String> = None;
    let mut new_hero: Option<String> = None;
    let mut new_logo: Option<String> = None;

    // 1. Steam Store API
    if game.source == "steam" {
        if let Some(appid) = game.steam_app_id {
            let url = format!("https://store.steampowered.com/api/appdetails?appids={appid}&l=english");
            if let Some(root) = curl_get_json(&url) {
                if let Some(data) = root.get(appid.to_string()).and_then(|v| v.get("data")) {
                    if let Some(desc) = data.get("short_description").and_then(|v| v.as_str()) {
                        meta["description"] = json!(strip_html(desc));
                    }
                    if let Some(devs) = data.get("developers").and_then(|v| v.as_array()) {
                        let joined: Vec<&str> = devs.iter().filter_map(|x| x.as_str()).collect();
                        if !joined.is_empty() {
                            meta["developer"] = json!(joined.join(", "));
                        }
                    }
                    if let Some(pubs) = data.get("publishers").and_then(|v| v.as_array()) {
                        let joined: Vec<&str> = pubs.iter().filter_map(|x| x.as_str()).collect();
                        if !joined.is_empty() {
                            meta["publisher"] = json!(joined.join(", "));
                        }
                    }
                    if let Some(rel) = data.get("release_date").and_then(|v| v.get("date")).and_then(|v| v.as_str()) {
                        if !rel.is_empty() {
                            meta["releaseDate"] = json!(rel);
                        }
                    }
                    if let Some(genres) = data.get("genres").and_then(|v| v.as_array()) {
                        let g: Vec<&str> = genres
                            .iter()
                            .filter_map(|x| x.get("description").and_then(|d| d.as_str()))
                            .collect();
                        if !g.is_empty() {
                            meta["genre"] = json!(g.join(" · "));
                        }
                    }
                    if let Some(shots) = data.get("screenshots").and_then(|v| v.as_array()) {
                        let urls: Vec<&str> = shots
                            .iter()
                            .filter_map(|x| x.get("path_full").and_then(|p| p.as_str()))
                            .take(6)
                            .collect();
                        if !urls.is_empty() {
                            meta["screenshots"] = json!(urls);
                            if game.hero.is_none() {
                                new_hero = Some(urls[0].to_string());
                            }
                        }
                    }
                }
            }
        }
    } else {
        // 2. Libretro Thumbnails for Console / Emulated ROMs
        if let Some(sys) = libretro_system_name(&game.platform) {
            let sys_enc = url_encode_path(sys);
            let stem = std::path::Path::new(&game.path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| game.title.clone());

            let mut candidates = vec![
                libretro_sanitize(&stem),
                libretro_sanitize(&game.title),
                format!("{} (USA)", libretro_sanitize(&game.title)),
                format!("{} (Europe)", libretro_sanitize(&game.title)),
                format!("{} (World)", libretro_sanitize(&game.title)),
                format!("{} (Japan)", libretro_sanitize(&game.title)),
            ];
            candidates.dedup();

            if game.cover.is_none() {
                for cand in &candidates {
                    let u = format!(
                        "https://thumbnails.libretro.com/{sys_enc}/Named_Boxarts/{}.png",
                        url_encode_path(cand)
                    );
                    if curl_head_ok(&u) {
                        new_cover = Some(u);
                        break;
                    }
                }
            }
            if game.hero.is_none() {
                for cand in &candidates {
                    let u = format!(
                        "https://thumbnails.libretro.com/{sys_enc}/Named_Snaps/{}.png",
                        url_encode_path(cand)
                    );
                    if curl_head_ok(&u) {
                        new_hero = Some(u.clone());
                        meta["screenshots"] = json!([u]);
                        break;
                    }
                }
            }
            if game.logo.is_none() {
                for cand in &candidates {
                    let u = format!(
                        "https://thumbnails.libretro.com/{sys_enc}/Named_Titles/{}.png",
                        url_encode_path(cand)
                    );
                    if curl_head_ok(&u) {
                        new_logo = Some(u);
                        break;
                    }
                }
            }
        }

        // 3. Optional IGDB API lookup when Twitch credentials are configured
        if let Some(creds) = igdb_creds.filter(|c| !c.client_id.trim().is_empty() && !c.client_secret.trim().is_empty()) {
            if let Some(igdb_data) = query_igdb(db, &creds, &game.title) {
                if let Some(summary) = igdb_data.get("summary").and_then(|v| v.as_str()) {
                    meta["description"] = json!(summary);
                }
                if let Some(genres) = igdb_data.get("genres").and_then(|v| v.as_array()) {
                    let names: Vec<&str> = genres.iter().filter_map(|g| g.get("name").and_then(|n| n.as_str())).collect();
                    if !names.is_empty() {
                        meta["genre"] = json!(names.join(" · "));
                    }
                }
                if let Some(ts) = igdb_data.get("first_release_date").and_then(|v| v.as_i64()) {
                    let year = 1970 + (ts / 31_557_600);
                    meta["releaseDate"] = json!(year.to_string());
                }
                if let Some(companies) = igdb_data.get("involved_companies").and_then(|v| v.as_array()) {
                    let mut devs = Vec::new();
                    let mut pubs = Vec::new();
                    for c in companies {
                        if let Some(name) = c.get("company").and_then(|co| co.get("name")).and_then(|n| n.as_str()) {
                            if c.get("developer").and_then(|b| b.as_bool()).unwrap_or(false) {
                                devs.push(name);
                            }
                            if c.get("publisher").and_then(|b| b.as_bool()).unwrap_or(false) {
                                pubs.push(name);
                            }
                        }
                    }
                    if !devs.is_empty() {
                        meta["developer"] = json!(devs.join(", "));
                    }
                    if !pubs.is_empty() {
                        meta["publisher"] = json!(pubs.join(", "));
                    }
                }
                if new_cover.is_none() && game.cover.is_none() {
                    if let Some(img_id) = igdb_data.get("cover").and_then(|c| c.get("image_id")).and_then(|i| i.as_str()) {
                        new_cover = Some(format!("https://images.igdb.com/igdb/image/upload/t_cover_big/{img_id}.jpg"));
                    }
                }
                if let Some(shots) = igdb_data.get("screenshots").and_then(|v| v.as_array()) {
                    let urls: Vec<String> = shots
                        .iter()
                        .filter_map(|s| s.get("image_id").and_then(|i| i.as_str()))
                        .take(5)
                        .map(|id| format!("https://images.igdb.com/igdb/image/upload/t_screenshot_big/{id}.jpg"))
                        .collect();
                    if !urls.is_empty() {
                        if new_hero.is_none() && game.hero.is_none() {
                            new_hero = Some(urls[0].clone());
                        }
                        meta["screenshots"] = json!(urls);
                    }
                }
            }
        }
    }

    meta["scrapedAt"] = json!(crate::db::now());
    {
        let lock = db.lock();
        lock.update_game_artwork_and_metadata(
            game.id,
            new_cover.as_deref(),
            new_hero.as_deref(),
            new_logo.as_deref(),
            &meta,
        )
        .map_err(|e| e.to_string())?;
        lock.game(game.id).map_err(|e| e.to_string())?.ok_or_else(|| "Game not found".into())
    }
}

fn query_igdb(db: &Mutex<Db>, creds: &IgdbCredentials, title: &str) -> Option<Value> {
    let mut token = creds.access_token.clone();
    if token.is_none() {
        token = obtain_twitch_token(&creds.client_id, &creds.client_secret);
        if let Some(ref t) = token {
            let mut updated = creds.clone();
            updated.access_token = Some(t.clone());
            let _ = db.lock().kv_set("igdb_credentials", &updated);
        }
    }
    let token = token?;
    let clean = title.replace('"', "");
    let body = format!(
        "search \"{clean}\"; fields name,summary,first_release_date,cover.image_id,screenshots.image_id,genres.name,involved_companies.developer,involved_companies.publisher,involved_companies.company.name; limit 1;"
    );
    let out = Command::new("curl")
        .args([
            "-sSL",
            "--max-time",
            "8",
            "-X",
            "POST",
            "https://api.igdb.com/v4/games",
            "-H",
            &format!("Client-ID: {}", creds.client_id.trim()),
            "-H",
            &format!("Authorization: Bearer {token}"),
            "-d",
            &body,
        ])
        .output()
        .ok()?;
    let arr: Value = serde_json::from_slice(&out.stdout).ok()?;
    arr.as_array()?.first().cloned()
}

fn obtain_twitch_token(client_id: &str, client_secret: &str) -> Option<String> {
    let url = format!(
        "https://id.twitch.tv/oauth2/token?client_id={}&client_secret={}&grant_type=client_credentials",
        url_encode_path(client_id.trim()),
        url_encode_path(client_secret.trim())
    );
    let out = Command::new("curl")
        .args(["-sSL", "--max-time", "8", "-X", "POST", &url])
        .output()
        .ok()?;
    let v: Value = serde_json::from_slice(&out.stdout).ok()?;
    v.get("access_token").and_then(|t| t.as_str()).map(|s| s.to_string())
}

fn strip_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut inside = false;
    for c in input.chars() {
        match c {
            '<' => inside = true,
            '>' => inside = false,
            _ if !inside => out.push(c),
            _ => {}
        }
    }
    out.replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}
