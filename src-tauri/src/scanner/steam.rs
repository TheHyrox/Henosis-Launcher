//! Steam library detection (installed games via appmanifest files).

use std::path::{Path, PathBuf};

use crate::models::ScannedGame;
use crate::vdf;

/// Candidate Steam installation roots on Linux.
pub fn find_steam_root(custom: Option<&str>) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(c) = custom {
        candidates.push(PathBuf::from(c));
    }
    candidates.push(home.join(".local/share/Steam"));
    candidates.push(home.join(".steam/steam"));
    candidates.push(home.join(".steam/root"));
    candidates.push(home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"));
    candidates.into_iter().find(|p| p.join("steamapps").is_dir())
}

fn library_folders(root: &Path) -> Vec<PathBuf> {
    let mut libs = vec![root.to_path_buf()];
    let file = root.join("steamapps/libraryfolders.vdf");
    if let Ok(text) = std::fs::read_to_string(&file) {
        let v = vdf::parse(&text);
        if let Some(folders) = v.get("libraryfolders") {
            for (_, entry) in folders.entries() {
                if let Some(path) = entry.str("path") {
                    let p = PathBuf::from(path);
                    if !libs.iter().any(|l| same_path(l, &p)) {
                        libs.push(p);
                    }
                }
            }
        }
    }
    libs
}

fn same_path(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(x), Ok(y)) => x == y,
        _ => a == b,
    }
}

/// Steam tools / runtimes that are not games.
fn is_tool(appid: u32, name: &str) -> bool {
    const TOOL_IDS: &[u32] = &[228980, 1070560, 1391110, 1628350, 1493710, 2180100, 1826330, 250820, 431960];
    let n = name.to_lowercase();
    TOOL_IDS.contains(&appid)
        || n.starts_with("proton")
        || n.starts_with("steam linux runtime")
        || n.starts_with("steamworks")
        || n.contains("dedicated server")
        || n == "steamvr"
        || n == "wallpaper engine"
}

pub fn scan(custom_root: Option<&str>) -> Vec<ScannedGame> {
    let Some(root) = find_steam_root(custom_root) else { return vec![] };
    let cache = root.join("appcache/librarycache");
    let mut games = Vec::new();

    for lib in library_folders(&root) {
        let apps = lib.join("steamapps");
        let Ok(entries) = std::fs::read_dir(&apps) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !(name.starts_with("appmanifest_") && name.ends_with(".acf")) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(entry.path()) else { continue };
            let v = vdf::parse(&text);
            let Some(app) = v.get("AppState") else { continue };
            let Some(appid) = app.str("appid").and_then(|s| s.parse::<u32>().ok()) else { continue };
            let title = app.str("name").unwrap_or("Unknown").to_string();
            if is_tool(appid, &title) {
                continue;
            }
            // StateFlags bit 4 = fully installed
            let flags = app.str("StateFlags").and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
            if flags & 4 == 0 {
                continue;
            }
            let size = app.str("SizeOnDisk").and_then(|s| s.parse::<i64>().ok());
            let install_dir = app.str("installdir").map(|d| apps.join("common").join(d));
            let art = find_art(&cache, appid);

            games.push(ScannedGame {
                platform: "steam".into(),
                title,
                path: format!("steam://rungameid/{appid}"),
                source: "steam".into(),
                steam_app_id: Some(appid),
                cover: art.cover.or_else(|| Some(cdn(appid, "library_600x900.jpg"))),
                hero: art.hero.or_else(|| Some(cdn(appid, "library_hero.jpg"))),
                logo: art.logo.or_else(|| Some(cdn(appid, "logo.png"))),
                file_size: size,
                metadata: Some(serde_json::json!({
                    "installDir": install_dir.map(|p| p.to_string_lossy().to_string()),
                    "header": art.header.unwrap_or_else(|| cdn(appid, "header.jpg")),
                })),
                ..Default::default()
            });
        }
    }
    games
}

fn cdn(appid: u32, file: &str) -> String {
    format!("https://shared.steamstatic.com/store_item_assets/steam/apps/{appid}/{file}")
}

#[derive(Default)]
struct Art {
    cover: Option<String>,
    hero: Option<String>,
    logo: Option<String>,
    header: Option<String>,
}

/// Look up artwork in Steam's local library cache (supports old flat and new per-app layouts).
fn find_art(cache: &Path, appid: u32) -> Art {
    let mut art = Art::default();
    let dir = cache.join(appid.to_string());
    let mut files: Vec<PathBuf> = Vec::new();
    if dir.is_dir() {
        for e in walkdir::WalkDir::new(&dir).max_depth(2).into_iter().flatten() {
            if e.file_type().is_file() {
                files.push(e.into_path());
            }
        }
    }
    for suffix in [
        "library_600x900.jpg",
        "library_600x900_2x.jpg",
        "library_capsule.jpg",
        "library_hero.jpg",
        "logo.png",
        "header.jpg",
    ] {
        let flat = cache.join(format!("{appid}_{suffix}"));
        if flat.is_file() {
            files.push(flat);
        }
    }
    let find = |names: &[&str]| -> Option<String> {
        names.iter().find_map(|n| {
            files
                .iter()
                .find(|f| f.file_name().map(|x| x.to_string_lossy().ends_with(n)).unwrap_or(false))
                .map(|f| f.to_string_lossy().to_string())
        })
    };
    art.cover = find(&["library_600x900_2x.jpg", "library_600x900.jpg", "library_capsule.jpg"]);
    art.hero = find(&["library_hero.jpg"]);
    art.logo = find(&["logo.png"]);
    art.header = find(&["header.jpg"]);
    art
}
