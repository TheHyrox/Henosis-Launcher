//! Shared data structures exchanged between the backend and the UI.

use serde::{Deserialize, Serialize};

use crate::settings::GameSettings;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: i64,
    pub platform: String,
    pub title: String,
    pub path: String,
    /// "steam" | "rom" | "manual"
    pub source: String,
    pub steam_app_id: Option<u32>,
    pub region: Option<String>,
    /// Product code / title id when known (e.g. BLES01807 for PS3).
    pub serial: Option<String>,
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
    pub favorite: bool,
    pub hidden: bool,
    pub added_at: i64,
    pub last_played: Option<i64>,
    /// Total play time in seconds.
    pub playtime: i64,
    pub play_count: i64,
    pub missing: bool,
    pub file_size: Option<i64>,
    pub settings: GameSettings,
    /// Free-form metadata (developer, publisher, description…), filled by Phase 2 scrapers.
    pub metadata: serde_json::Value,
}

/// Lightweight record produced by scanners before insertion in the database.
#[derive(Debug, Clone, Default)]
pub struct ScannedGame {
    pub platform: String,
    pub title: String,
    pub path: String,
    pub source: String,
    pub steam_app_id: Option<u32>,
    pub region: Option<String>,
    pub serial: Option<String>,
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
    pub file_size: Option<i64>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanDir {
    pub path: String,
    /// Force every game in this directory to a given platform (optional).
    pub platform: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PlatformConfig {
    pub platform: String,
    pub default_emulator: Option<String>,
    pub bios_dir: Option<String>,
    /// Platform-wide default settings, overridden by per-game settings.
    #[serde(default)]
    pub settings: GameSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Emulator {
    pub id: String,
    /// Preset id (e.g. "dolphin") or "custom".
    pub preset: String,
    pub name: String,
    /// Executable path, or Flatpak application id when `kind == "flatpak"`.
    pub exec: String,
    /// "binary" | "flatpak" | "appimage"
    pub kind: String,
    pub version: Option<String>,
    pub platforms: Vec<String>,
    /// Argument template. Tokens: {rom} {rom_dir} {rom_stem} {core} {bios} {settings} {serial}
    pub args: String,
    /// Optional working directory.
    pub workdir: Option<String>,
    /// RetroArch only: cores directory.
    pub cores_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub steam_enabled: bool,
    pub steam_path: Option<String>,
    pub autostart: bool,
    pub start_hidden: bool,
    pub hide_on_launch: bool,
    pub guide_summons: bool,
    pub ui_sounds: bool,
    pub show_empty_platforms: bool,
    pub es_de_media_dir: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            steam_enabled: true,
            steam_path: None,
            autostart: false,
            start_hidden: false,
            hide_on_launch: true,
            guide_summons: true,
            ui_sounds: true,
            show_empty_platforms: false,
            es_de_media_dir: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformSummary {
    #[serde(flatten)]
    pub platform: crate::platforms::Platform,
    pub game_count: i64,
    pub last_played: Option<i64>,
    pub default_emulator: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub added: usize,
    pub updated: usize,
    pub missing: usize,
    pub total: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: i64,
    pub game_id: i64,
    pub started: i64,
    pub ended: i64,
    pub duration: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataCandidate {
    pub source: String,
    pub title: String,
    pub release_date: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub genre: Option<String>,
    pub description: Option<String>,
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
    pub region: Option<String>,
    pub serial: Option<String>,
    pub steam_app_id: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameMetadataUpdate {
    pub title: Option<String>,
    pub platform: Option<String>,
    pub region: Option<String>,
    pub serial: Option<String>,
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub genre: Option<String>,
    pub description: Option<String>,
}
