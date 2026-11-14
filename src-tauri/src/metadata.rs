//! Automatic metadata & boxart scraper:
//! 1. Steam Store API (`store.steampowered.com/api/appdetails`) for Steam games – fetches
//!    synopsis, developer, publisher, release date, genres, and screenshots with zero API keys.
//! 2. Libretro Thumbnails CDN (`thumbnails.libretro.com`) for retro & emulated console games –
//!    fetches official `Named_Boxarts`, `Named_Snaps`, and `Named_Titles` artwork.
//! 3. Optional IGDB API (via Twitch Client-ID + Client-Secret) for rich retro/emulated synopses,
//!    developers, publishers, genres, and release years.

use std::collections::HashMap;
use std::process::Command;
use std::sync::OnceLock;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::Db;
use crate::models::{Game, GameMetadataUpdate, MetadataCandidate};
use crate::platforms;
use crate::scanner::roms::clean_title;

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
    fetch_for_game_opts(db, game_id, false, None)
}

/// Fetch metadata & artwork with optional force-overwrite and custom search query.
pub fn fetch_for_game_opts(
    db: &Mutex<Db>,
    game_id: i64,
    force: bool,
    custom_query: Option<&str>,
) -> Result<Game, String> {
    let (game, igdb_creds) = {
        let lock = db.lock();
        let g = lock.game(game_id).map_err(|e| e.to_string())?.ok_or("Game not found")?;
        let creds: Option<IgdbCredentials> = lock.kv_get("igdb_credentials");
        (g, creds)
    };

    let lookup_title = custom_query
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(&game.title)
        .to_string();

    let mut meta = if game.metadata.is_object() { game.metadata.clone() } else { json!({}) };
    let mut new_cover: Option<String> = None;
    let mut new_hero: Option<String> = None;
    let mut new_logo: Option<String> = None;

    let title_locked = meta.get("titleLocked").and_then(|v| v.as_i64()).unwrap_or(0) == 1
        || meta.get("metadataLocked").and_then(|v| v.as_i64()).unwrap_or(0) == 1
        || custom_query.is_some();

    // 1. Steam Store API
    if game.source == "steam" {
        if let Some(appid) = game.steam_app_id {
            if let Some(details) = fetch_steam_appdetails(appid) {
                if let Some(desc) = details.description {
                    meta["description"] = json!(desc);
                }
                if let Some(dev) = details.developer {
                    meta["developer"] = json!(dev);
                }
                if let Some(pub_) = details.publisher {
                    meta["publisher"] = json!(pub_);
                }
                if let Some(rel) = details.release_date {
                    meta["releaseDate"] = json!(rel);
                }
                if let Some(genre) = details.genre {
                    meta["genre"] = json!(genre);
                }
                if let Some(hero) = details.hero {
                    if force || game.hero.is_none() {
                        new_hero = Some(hero);
                    }
                }
                if force && details.cover.is_some() {
                    new_cover = details.cover;
                }
            }
        }
    } else {
        // 2. Libretro Thumbnails for Console / Emulated ROMs
        if let Some((cov, her, log)) = probe_libretro_artwork(&game.platform, &game.path, &lookup_title, title_locked || force) {
            if force || game.cover.is_none() {
                new_cover = cov;
            }
            if force || game.hero.is_none() {
                if let Some(ref h) = her {
                    meta["screenshots"] = json!([h]);
                }
                new_hero = her;
            }
            if force || game.logo.is_none() {
                new_logo = log;
            }
        }

        // 3. Optional IGDB API lookup when Twitch credentials are configured
        let mut found_rich_meta = false;
        if let Some(creds) = igdb_creds.filter(|c| !c.client_id.trim().is_empty() && !c.client_secret.trim().is_empty()) {
            if let Some(igdb_data) = query_igdb(db, &creds, &lookup_title, 1).and_then(|v| v.into_iter().next()) {
                found_rich_meta = true;
                if let Some( desc) = igdb_data.description {
                    meta["description"] = json!(desc);
                }
                if let Some(genre) = igdb_data.genre {
                    meta["genre"] = json!(genre);
                }
                if let Some(rel) = igdb_data.release_date {
                    meta["releaseDate"] = json!(rel);
                }
                if let Some(dev) = igdb_data.developer {
                    meta["developer"] = json!(dev);
                }
                if let Some(pub_) = igdb_data.publisher {
                    meta["publisher"] = json!(pub_);
                }
                if new_cover.is_none() && (force || game.cover.is_none()) {
                    new_cover = igdb_data.cover;
                }
                if new_hero.is_none() && (force || game.hero.is_none()) {
                    new_hero = igdb_data.hero;
                }
            }
        }

        // 4. Zero-key fallback via Steam Store search for rich synopsis/credits if IGDB wasn't used
        if !found_rich_meta && (force || meta.get("description").is_none()) {
            if let Some(steam_cand) = search_steam_candidates(&lookup_title, 1).into_iter().next() {
                if let Some(appid) = steam_cand.steam_app_id {
                    if let Some(details) = fetch_steam_appdetails(appid) {
                        if let Some(desc) = details.description {
                            meta["description"] = json!(desc);
                        }
                        if let Some(dev) = details.developer {
                            meta["developer"] = json!(dev);
                        }
                        if let Some(pub_) = details.publisher {
                            meta["publisher"] = json!(pub_);
                        }
                        if let Some(rel) = details.release_date {
                            meta["releaseDate"] = json!(rel);
                        }
                        if let Some(genre) = details.genre {
                            meta["genre"] = json!(genre);
                        }
                        if new_hero.is_none() && (force || game.hero.is_none()) {
                            new_hero = details.hero;
                        }
                    }
                }
            }
        }
    }

    meta["scrapedAt"] = json!(crate::db::now());
    {
        let lock = db.lock();
        if force {
            let final_title = if custom_query.is_some() { &lookup_title } else { &game.title };
            let final_cover = new_cover.as_deref().or(game.cover.as_deref());
            let final_hero = new_hero.as_deref().or(game.hero.as_deref());
            let final_logo = new_logo.as_deref().or(game.logo.as_deref());
            lock.set_game_full_metadata(
                game.id,
                final_title,
                &game.platform,
                game.steam_app_id,
                game.region.as_deref(),
                game.serial.as_deref(),
                final_cover,
                final_hero,
                final_logo,
                &meta,
            )
            .map_err(|e| e.to_string())?;
        } else {
            lock.update_game_artwork_and_metadata(
                game.id,
                new_cover.as_deref(),
                new_hero.as_deref(),
                new_logo.as_deref(),
                &meta,
            )
            .map_err(|e| e.to_string())?;
        }
        lock.game(game.id).map_err(|e| e.to_string())?.ok_or_else(|| "Game not found".into())
    }
}

/// Probe Libretro Thumbnails CDN for a given platform and title.
fn probe_libretro_artwork(
    platform: &str,
    path: &str,
    title: &str,
    prioritize_title: bool,
) -> Option<(Option<String>, Option<String>, Option<String>)> {
    let sys = libretro_system_name(platform)?;
    let sys_enc = url_encode_path(sys);
    let stem = std::path::Path::new(path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| title.to_string());

    let clean_t = libretro_sanitize(title);
    let clean_stem = libretro_sanitize(&stem);

    let mut candidates = Vec::new();
    if prioritize_title {
        candidates.push(clean_t.clone());
        candidates.push(format!("{clean_t} (USA)"));
        candidates.push(format!("{clean_t} (Europe)"));
        candidates.push(format!("{clean_t} (World)"));
        candidates.push(format!("{clean_t} (Japan)"));
        candidates.push(clean_stem);
    } else {
        candidates.push(clean_stem);
        candidates.push(clean_t.clone());
        candidates.push(format!("{clean_t} (USA)"));
        candidates.push(format!("{clean_t} (Europe)"));
        candidates.push(format!("{clean_t} (World)"));
        candidates.push(format!("{clean_t} (Japan)"));
    }
    candidates.dedup();

    let mut new_cover = None;
    let mut new_hero = None;
    let mut new_logo = None;

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
    for cand in &candidates {
        let u = format!(
            "https://thumbnails.libretro.com/{sys_enc}/Named_Snaps/{}.png",
            url_encode_path(cand)
        );
        if curl_head_ok(&u) {
            new_hero = Some(u);
            break;
        }
    }
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

    Some((new_cover, new_hero, new_logo))
}

/// Search metadata candidates across Libretro CDN, IGDB, Steam Store, and local filename.
pub fn search_candidates(
    db: &Mutex<Db>,
    game_id: i64,
    query: Option<String>,
) -> Result<Vec<MetadataCandidate>, String> {
    let (game, igdb_creds) = {
        let lock = db.lock();
        let g = lock.game(game_id).map_err(|e| e.to_string())?.ok_or("Game not found")?;
        let creds: Option<IgdbCredentials> = lock.kv_get("igdb_credentials");
        (g, creds)
    };

    let q = query
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| game.title.clone());

    let mut out: Vec<MetadataCandidate> = Vec::new();

    // 1. IGDB Search first (when configured) for rich game metadata
    if let Some(creds) = igdb_creds.filter(|c| !c.client_id.trim().is_empty() && !c.client_secret.trim().is_empty()) {
        if let Some(mut igdb_list) = query_igdb(db, &creds, &q, 6) {
            out.append(&mut igdb_list);
        }
    }

    // 2. Steam Store Search (works with zero API keys for any game)
    let mut steam_list = search_steam_candidates(&q, 5);
    out.append(&mut steam_list);

    // 3. Libretro CDN fuzzy/accent-insensitive search against platform Named_Boxarts index
    if let Some(sys) = libretro_system_name(&game.platform) {
        let mut lr_list = search_libretro_candidates(sys, &q, game.serial.as_deref(), 12);
        if lr_list.is_empty() {
            // Fallback to direct HEAD probes if directory listing failed
            let sys_enc = url_encode_path(sys);
            let base = libretro_sanitize(&q);
            let variants = [
                (q.clone(), base.clone(), game.region.clone()),
                (q.clone(), format!("{base} (USA)"), Some("USA".into())),
                (q.clone(), format!("{base} (Europe)"), Some("Europe".into())),
                (q.clone(), format!("{base} (World)"), Some("World".into())),
                (q.clone(), format!("{base} (Japan)"), Some("Japan".into())),
            ];
            let mut seen_urls = std::collections::HashSet::new();
            for (disp_title, cand_name, reg) in variants {
                let box_url = format!(
                    "https://thumbnails.libretro.com/{sys_enc}/Named_Boxarts/{}.png",
                    url_encode_path(&cand_name)
                );
                if seen_urls.contains(&box_url) {
                    continue;
                }
                if curl_head_ok(&box_url) {
                    seen_urls.insert(box_url.clone());
                    let snap_url = format!(
                        "https://thumbnails.libretro.com/{sys_enc}/Named_Snaps/{}.png",
                        url_encode_path(&cand_name)
                    );
                    let logo_url = format!(
                        "https://thumbnails.libretro.com/{sys_enc}/Named_Titles/{}.png",
                        url_encode_path(&cand_name)
                    );
                    lr_list.push(MetadataCandidate {
                        source: "libretro".into(),
                        title: disp_title,
                        release_date: None,
                        developer: None,
                        publisher: None,
                        genre: None,
                        description: Some(format!("Official Libretro Thumbnail Boxart match ({cand_name})")),
                        cover: Some(box_url),
                        hero: curl_head_ok(&snap_url).then_some(snap_url),
                        logo: curl_head_ok(&logo_url).then_some(logo_url),
                        region: reg,
                        serial: game.serial.clone(),
                        steam_app_id: None,
                    });
                    if lr_list.len() >= 2 {
                        break;
                    }
                }
            }
        }
        out.append(&mut lr_list);
    }

    // 4. Local Clean Filename candidate (to easily restore from the ROM file name)
    let stem = std::path::Path::new(&game.path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| game.title.clone());
    let (cleaned_title, cleaned_region, cleaned_serial) = clean_title(&stem);
    out.push(MetadataCandidate {
        source: "local".into(),
        title: cleaned_title,
        release_date: None,
        developer: None,
        publisher: None,
        genre: None,
        description: Some(format!("Derived directly from local file: {stem}")),
        cover: None,
        hero: None,
        logo: None,
        region: cleaned_region,
        serial: cleaned_serial,
        steam_app_id: None,
    });

    Ok(out)
}

/// Apply a selected `MetadataCandidate` to a game, overwriting wrongly linked metadata and artwork.
pub fn apply_candidate(
    db: &Mutex<Db>,
    game_id: i64,
    mut cand: MetadataCandidate,
) -> Result<Game, String> {
    let game = {
        let lock = db.lock();
        lock.game(game_id).map_err(|e| e.to_string())?.ok_or("Game not found")?
    };

    // If this candidate comes from Steam Search, enrich it with full Steam appdetails
    if let Some(appid) = cand.steam_app_id {
        if cand.description.is_none() || cand.developer.is_none() {
            if let Some(details) = fetch_steam_appdetails(appid) {
                if cand.description.is_none() {
                    cand.description = details.description;
                }
                if cand.developer.is_none() {
                    cand.developer = details.developer;
                }
                if cand.publisher.is_none() {
                    cand.publisher = details.publisher;
                }
                if cand.release_date.is_none() {
                    cand.release_date = details.release_date;
                }
                if cand.genre.is_none() {
                    cand.genre = details.genre;
                }
                if cand.hero.is_none() {
                    cand.hero = details.hero;
                }
                if cand.cover.is_none() {
                    cand.cover = details.cover;
                }
            }
        }
    }

    // For console ROMs, prefer Libretro console boxart for the matched title if available
    if game.source != "steam" {
        if let Some((lib_cov, lib_hero, lib_logo)) =
            probe_libretro_artwork(&game.platform, &game.path, &cand.title, true)
        {
            if cand.source != "libretro" {
                if let Some(c) = lib_cov {
                    cand.cover = Some(c);
                }
            }
            if cand.hero.is_none() {
                cand.hero = lib_hero;
            }
            if cand.logo.is_none() {
                cand.logo = lib_logo;
            }
        }
    }

    let mut meta = if game.metadata.is_object() { game.metadata.clone() } else { json!({}) };
    if let Some(desc) = &cand.description {
        meta["description"] = json!(desc);
    }
    if let Some(dev) = &cand.developer {
        meta["developer"] = json!(dev);
    }
    if let Some(pub_) = &cand.publisher {
        meta["publisher"] = json!(pub_);
    }
    if let Some(rel) = &cand.release_date {
        meta["releaseDate"] = json!(rel);
    }
    if let Some(gen) = &cand.genre {
        meta["genre"] = json!(gen);
    }
    if let Some(h) = &cand.hero {
        meta["screenshots"] = json!([h]);
    }
    meta["titleLocked"] = json!(1);
    meta["metadataLocked"] = json!(1);
    meta["scrapedAt"] = json!(crate::db::now());

    let final_title = cand.title.trim();
    let final_title = if final_title.is_empty() { &game.title } else { final_title };
    let final_region = cand.region.as_deref().or(game.region.as_deref());
    let final_serial = cand.serial.as_deref().or(game.serial.as_deref());
    let final_appid = if game.source == "steam" {
        cand.steam_app_id.or(game.steam_app_id)
    } else {
        game.steam_app_id
    };

    let lock = db.lock();
    lock.set_game_full_metadata(
        game.id,
        final_title,
        &game.platform,
        final_appid,
        final_region,
        final_serial,
        cand.cover.as_deref(),
        cand.hero.as_deref(),
        cand.logo.as_deref(),
        &meta,
    )
    .map_err(|e| e.to_string())?;
    lock.game(game.id).map_err(|e| e.to_string())?.ok_or_else(|| "Game not found".into())
}

/// Manually update individual metadata & artwork fields on a game.
/// Passing `Some("")` for an optional field clears it.
pub fn update_manual_metadata(
    db: &Mutex<Db>,
    game_id: i64,
    patch: GameMetadataUpdate,
) -> Result<Game, String> {
    let game = {
        let lock = db.lock();
        lock.game(game_id).map_err(|e| e.to_string())?.ok_or("Game not found")?
    };

    let norm_opt = |incoming: Option<String>, existing: Option<String>| -> Option<String> {
        match incoming {
            Some(s) => {
                let t = s.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(t.to_string())
                }
            }
            None => existing,
        }
    };

    let final_title = patch
        .title
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(&game.title)
        .to_string();

    let final_platform = match patch.platform.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        Some(p) => {
            platforms::get(p).ok_or("Unknown platform")?;
            p.to_string()
        }
        None => game.platform.clone(),
    };

    let final_region = norm_opt(patch.region, game.region);
    let final_serial = norm_opt(patch.serial, game.serial);
    let final_cover = norm_opt(patch.cover, game.cover);
    let final_hero = norm_opt(patch.hero, game.hero);
    let final_logo = norm_opt(patch.logo, game.logo);

    let mut meta = if game.metadata.is_object() { game.metadata.clone() } else { json!({}) };
    let set_or_clear_meta = |m: &mut Value, key: &str, val: Option<String>| {
        if let Some(v) = val {
            let t = v.trim();
            if t.is_empty() {
                if let Some(obj) = m.as_object_mut() {
                    obj.remove(key);
                }
            } else {
                m[key] = json!(t);
            }
        }
    };

    set_or_clear_meta(&mut meta, "developer", patch.developer);
    set_or_clear_meta(&mut meta, "publisher", patch.publisher);
    set_or_clear_meta(&mut meta, "releaseDate", patch.release_date);
    set_or_clear_meta(&mut meta, "genre", patch.genre);
    set_or_clear_meta(&mut meta, "description", patch.description);

    meta["titleLocked"] = json!(1);
    meta["metadataLocked"] = json!(1);

    let lock = db.lock();
    lock.set_game_full_metadata(
        game.id,
        &final_title,
        &final_platform,
        game.steam_app_id,
        final_region.as_deref(),
        final_serial.as_deref(),
        final_cover.as_deref(),
        final_hero.as_deref(),
        final_logo.as_deref(),
        &meta,
    )
    .map_err(|e| e.to_string())?;
    lock.game(game.id).map_err(|e| e.to_string())?.ok_or_else(|| "Game not found".into())
}

/// Reset wrongly linked metadata & artwork back to clean filename defaults, optionally re-scraping.
pub fn reset_metadata(db: &Mutex<Db>, game_id: i64, rescrape: bool) -> Result<Game, String> {
    let game = {
        let lock = db.lock();
        lock.game(game_id).map_err(|e| e.to_string())?.ok_or("Game not found")?
    };

    let stem = std::path::Path::new(&game.path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| game.title.clone());
    let (cleaned_title, cleaned_region, cleaned_serial) = clean_title(&stem);

    let reset_title = if game.source == "steam" {
        game.title.clone()
    } else {
        cleaned_title
    };

    let fresh_meta = json!({});
    {
        let lock = db.lock();
        lock.set_game_full_metadata(
            game.id,
            &reset_title,
            &game.platform,
            game.steam_app_id,
            cleaned_region.as_deref(),
            cleaned_serial.as_deref(),
            None,
            None,
            None,
            &fresh_meta,
        )
        .map_err(|e| e.to_string())?;
    }

    if rescrape {
        fetch_for_game_opts(db, game.id, true, Some(&reset_title))
    } else {
        let lock = db.lock();
        lock.game(game.id).map_err(|e| e.to_string())?.ok_or_else(|| "Game not found".into())
    }
}

fn fetch_steam_appdetails(appid: u32) -> Option<MetadataCandidate> {
    let url = format!("https://store.steampowered.com/api/appdetails?appids={appid}&l=english");
    let root = curl_get_json(&url)?;
    let data = root.get(appid.to_string())?.get("data")?;
    let title = data
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let description = data
        .get("short_description")
        .and_then(|v| v.as_str())
        .map(strip_html);
    let developer = data
        .get("developers")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", "))
        .filter(|s| !s.is_empty());
    let publisher = data
        .get("publishers")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", "))
        .filter(|s| !s.is_empty());
    let release_date = data
        .get("release_date")
        .and_then(|v| v.get("date"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let genre = data
        .get("genres")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.get("description").and_then(|d| d.as_str()))
                .collect::<Vec<_>>()
                .join(" · ")
        })
        .filter(|s| !s.is_empty());
    let hero = data
        .get("screenshots")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|x| x.get("path_full"))
        .and_then(|p| p.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            data.get("header_image")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });
    let cover = Some(format!(
        "https://shared.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900.jpg"
    ));

    Some(MetadataCandidate {
        source: "steam".into(),
        title,
        release_date,
        developer,
        publisher,
        genre,
        description,
        cover,
        hero,
        logo: None,
        region: None,
        serial: None,
        steam_app_id: Some(appid),
    })
}

fn search_steam_candidates(query: &str, limit: usize) -> Vec<MetadataCandidate> {
    let url = format!(
        "https://store.steampowered.com/api/storesearch/?term={}&l=english&cc=US",
        url_encode_path(query)
    );
    let Some(root) = curl_get_json(&url) else { return Vec::new() };
    let Some(items) = root.get("items").and_then(|v| v.as_array()) else { return Vec::new() };
    let mut out = Vec::new();
    for item in items.iter().take(limit) {
        let Some(appid) = item.get("id").and_then(|v| v.as_u64()).map(|n| n as u32) else { continue };
        let Some(name) = item.get("name").and_then(|v| v.as_str()) else { continue };
        let cover = format!(
            "https://shared.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900.jpg"
        );
        let hero = format!(
            "https://shared.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg"
        );
        out.push(MetadataCandidate {
            source: "steam".into(),
            title: name.to_string(),
            release_date: None,
            developer: None,
            publisher: None,
            genre: None,
            description: Some(format!("Steam Store AppID #{appid} — Select to link synopsis, credits & artwork")),
            cover: Some(cover),
            hero: Some(hero),
            logo: None,
            region: None,
            serial: None,
            steam_app_id: Some(appid),
        });
    }
    out
}

fn query_igdb(
    db: &Mutex<Db>,
    creds: &IgdbCredentials,
    title: &str,
    limit: usize,
) -> Option<Vec<MetadataCandidate>> {
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
        "search \"{clean}\"; fields name,summary,first_release_date,cover.image_id,screenshots.image_id,genres.name,involved_companies.developer,involved_companies.publisher,involved_companies.company.name; limit {limit};"
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
    let list = arr.as_array()?;
    let mut candidates = Vec::new();
    for item in list {
        let Some(name) = item.get("name").and_then(|v| v.as_str()) else { continue };
        let summary = item.get("summary").and_then(|v| v.as_str()).map(|s| s.to_string());
        let genre = item
            .get("genres")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|g| g.get("name").and_then(|n| n.as_str()))
                    .collect::<Vec<_>>()
                    .join(" · ")
            })
            .filter(|s| !s.is_empty());
        let release_date = item
            .get("first_release_date")
            .and_then(|v| v.as_i64())
            .map(|ts| (1970 + (ts / 31_557_600)).to_string());
        let mut developer = None;
        let mut publisher = None;
        if let Some(companies) = item.get("involved_companies").and_then(|v| v.as_array()) {
            let mut devs = Vec::new();
            let mut pubs = Vec::new();
            for c in companies {
                if let Some(cname) = c.get("company").and_then(|co| co.get("name")).and_then(|n| n.as_str()) {
                    if c.get("developer").and_then(|b| b.as_bool()).unwrap_or(false) {
                        devs.push(cname);
                    }
                    if c.get("publisher").and_then(|b| b.as_bool()).unwrap_or(false) {
                        pubs.push(cname);
                    }
                }
            }
            if !devs.is_empty() {
                developer = Some(devs.join(", "));
            }
            if !pubs.is_empty() {
                publisher = Some(pubs.join(", "));
            }
        }
        let cover = item
            .get("cover")
            .and_then(|c| c.get("image_id"))
            .and_then(|i| i.as_str())
            .map(|img_id| format!("https://images.igdb.com/igdb/image/upload/t_cover_big/{img_id}.jpg"));
        let hero = item
            .get("screenshots")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|s| s.get("image_id"))
            .and_then(|i| i.as_str())
            .map(|img_id| format!("https://images.igdb.com/igdb/image/upload/t_screenshot_big/{img_id}.jpg"));

        candidates.push(MetadataCandidate {
            source: "igdb".into(),
            title: name.to_string(),
            release_date,
            developer,
            publisher,
            genre,
            description: summary,
            cover,
            hero,
            logo: None,
            region: None,
            serial: None,
            steam_app_id: None,
        });
    }
    Some(candidates)
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

#[derive(Clone)]
struct LibretroEntry {
    href: String,
    stem: String,
    norm_title: String,
    region: Option<String>,
}

static LIBRETRO_INDEX_CACHE: OnceLock<Mutex<HashMap<String, Vec<LibretroEntry>>>> = OnceLock::new();

fn fold_accents_and_normalize(input: &str) -> String {
    // Strip parenthesized (...) and bracketed [...] tags
    let mut base = String::with_capacity(input.len());
    let mut paren_depth = 0u32;
    let mut bracket_depth = 0u32;
    for ch in input.chars() {
        match ch {
            '(' => paren_depth += 1,
            ')' => paren_depth = paren_depth.saturating_sub(1),
            '[' => bracket_depth += 1,
            ']' => bracket_depth = bracket_depth.saturating_sub(1),
            _ if paren_depth == 0 && bracket_depth == 0 => base.push(ch),
            _ => {}
        }
    }

    let mut out = String::with_capacity(base.len());
    let mut prev_space = true;
    for ch in base.chars() {
        let folded = match ch {
            'á' | 'à' | 'â' | 'ä' | 'ã' | 'å' | 'Á' | 'À' | 'Â' | 'Ä' | 'Ã' | 'Å' => 'a',
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'i',
            'ó' | 'ò' | 'ô' | 'ö' | 'õ' | 'Ó' | 'Ò' | 'Ô' | 'Ö' | 'Õ' => 'o',
            'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'u',
            'ç' | 'Ç' => 'c',
            'ñ' | 'Ñ' => 'n',
            'ý' | 'ÿ' | 'Ý' => 'y',
            c if c.is_ascii_alphanumeric() => c.to_ascii_lowercase(),
            _ => ' ',
        };
        if folded == ' ' {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        } else {
            out.push(folded);
            prev_space = false;
        }
    }
    out.trim().to_string()
}

fn extract_libretro_region(stem: &str) -> Option<String> {
    let start = stem.find('(')?;
    let rest = &stem[start + 1..];
    let end = rest.find(')')?;
    let tag = rest[..end].trim();
    if tag.is_empty() {
        None
    } else {
        Some(tag.to_string())
    }
}

fn get_libretro_index(sys: &str) -> Vec<LibretroEntry> {
    let cache = LIBRETRO_INDEX_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(existing) = cache.lock().get(sys) {
        return existing.clone();
    }

    let sys_enc = url_encode_path(sys);
    let url = format!("https://thumbnails.libretro.com/{sys_enc}/Named_Boxarts/");
    let output = match Command::new("curl")
        .args(["-sSL", "--max-time", "12", &url])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    let html = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();
    let mut cursor = html.as_ref();

    while let Some(href_pos) = cursor.find("<a href=\"") {
        let after_attr = &cursor[href_pos + 9..];
        let Some(quote_end) = after_attr.find('"') else {
            break;
        };
        let href = &after_attr[..quote_end];
        let after_quote = &after_attr[quote_end + 1..];
        let Some(tag_end) = after_quote.find('>') else {
            break;
        };
        let after_tag = &after_quote[tag_end + 1..];
        let Some(close_pos) = after_tag.find("</a>") else {
            break;
        };
        let raw_text = &after_tag[..close_pos];
        cursor = &after_tag[close_pos + 4..];

        if !href.to_ascii_lowercase().ends_with(".png") {
            continue;
        }
        let decoded_text = raw_text
            .replace("&amp;", "&")
            .replace("&quot;", "\"")
            .replace("&#39;", "'");
        let stem = decoded_text
            .strip_suffix(".png")
            .or_else(|| decoded_text.strip_suffix(".PNG"))
            .unwrap_or(&decoded_text)
            .trim()
            .to_string();
        if stem.is_empty() {
            continue;
        }

        let norm_title = fold_accents_and_normalize(&stem);
        if norm_title.is_empty() {
            continue;
        }

        entries.push(LibretroEntry {
            href: href.to_string(),
            region: extract_libretro_region(&stem),
            stem,
            norm_title,
        });
    }

    if !entries.is_empty() {
        cache.lock().insert(sys.to_string(), entries.clone());
    }
    entries
}

fn search_libretro_candidates(
    sys: &str,
    query: &str,
    serial: Option<&str>,
    limit: usize,
) -> Vec<MetadataCandidate> {
    let norm_q = fold_accents_and_normalize(query);
    if norm_q.is_empty() {
        return Vec::new();
    }
    let tokens: Vec<&str> = norm_q.split_whitespace().collect();
    if tokens.is_empty() {
        return Vec::new();
    }

    let entries = get_libretro_index(sys);
    if entries.is_empty() {
        return Vec::new();
    }

    let mut scored: Vec<(i32, &LibretroEntry)> = Vec::new();
    for entry in &entries {
        let mut score = if entry.norm_title == norm_q {
            1000
        } else if entry.norm_title.starts_with(&norm_q) {
            850 - (entry.norm_title.len() as i32 - norm_q.len() as i32).min(200)
        } else if entry.norm_title.contains(&norm_q) {
            700 - (entry.norm_title.len() as i32 - norm_q.len() as i32).min(200)
        } else {
            let matched = tokens.iter().filter(|t| entry.norm_title.contains(*t)).count();
            if matched == tokens.len() {
                550 - (entry.norm_title.len() as i32 - norm_q.len() as i32).abs().min(200)
            } else if tokens.len() >= 2 && matched + 1 >= tokens.len() {
                250 + (matched as i32 * 40) - (entry.norm_title.len() as i32).min(100)
            } else {
                continue;
            }
        };

        // Prefer clean retail regions (USA / Europe / France / World) over beta/hack/bad dumps
        if let Some(reg) = entry.region.as_deref() {
            if reg.contains("USA") || reg.contains("Europe") || reg.contains("World") {
                score += 30;
            } else if reg.contains("France") {
                score += 25;
            }
        }
        if entry.stem.contains("[b]") || entry.stem.contains("(Beta") || entry.stem.contains("(Proto") {
            score -= 120;
        }

        scored.push((score, entry));
    }

    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.stem.cmp(&b.1.stem)));

    let sys_enc = url_encode_path(sys);
    scored
        .into_iter()
        .take(limit)
        .map(|(_, entry)| {
            let box_url = format!(
                "https://thumbnails.libretro.com/{sys_enc}/Named_Boxarts/{}",
                entry.href
            );
            let snap_url = format!(
                "https://thumbnails.libretro.com/{sys_enc}/Named_Snaps/{}",
                entry.href
            );
            let logo_url = format!(
                "https://thumbnails.libretro.com/{sys_enc}/Named_Titles/{}",
                entry.href
            );
            let clean_disp = entry
                .stem
                .split('(')
                .next()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| entry.stem.clone());

            MetadataCandidate {
                source: "libretro".into(),
                title: clean_disp,
                release_date: None,
                developer: None,
                publisher: None,
                genre: None,
                description: Some(format!("Libretro Boxart: {}", entry.stem)),
                cover: Some(box_url),
                hero: Some(snap_url),
                logo: Some(logo_url),
                region: entry.region.clone(),
                serial: serial.map(|s| s.to_string()),
                steam_app_id: None,
            }
        })
        .collect()
}
