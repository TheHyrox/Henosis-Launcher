//! Per-game (and per-platform) technical settings.
//!
//! Every field is optional: `None` means "inherit" (game → platform → emulator default).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct GameSettings {
    /// Emulator id to use for this game.
    pub emulator_id: Option<String>,
    /// RetroArch core name (e.g. "snes9x").
    pub core: Option<String>,
    /// "vulkan" | "opengl" | "software"
    pub graphics_api: Option<String>,
    /// Internal rendering scale (1 = native).
    pub resolution_scale: Option<u8>,
    pub vsync: Option<bool>,
    /// Frame-rate cap (0 = unlimited).
    pub fps_limit: Option<u32>,
    /// "auto" | "4:3" | "16:9" | "stretch"
    pub aspect_ratio: Option<String>,
    /// Dual screen layout: "top-bottom" | "side-by-side" | "hybrid" | "single-top" | "single-bottom" | "separate"
    pub screen_layout: Option<String>,
    pub fullscreen: Option<bool>,
    /// Nintendo Switch mode: true = Docked (1080p), false = Handheld (720p).
    pub docked_mode: Option<bool>,
    /// Scaling filter: "nearest" | "bilinear" | "bicubic" | "scaleforce" | "fsr"
    pub scaling_filter: Option<String>,
    /// Boot mode: "direct" | "firmware"
    pub boot_mode: Option<String>,
    /// Stereoscopic 3D mode: "off" | "side-by-side" | "anaglyph"
    pub render_3d: Option<String>,
    /// CPU clock percentage: 100 = stock, 150 = 1.5x, 200 = 2x
    pub cpu_overclock: Option<u32>,
    /// Controller / input profile name understood by the emulator.
    pub input_profile: Option<String>,
    /// Extra arguments appended to the command line.
    pub launch_args: Option<String>,
    /// Environment variables (KEY=VALUE per entry).
    pub env: Option<Vec<String>>,
    /// Wrappers
    pub gamemode: Option<bool>,
    pub mangohud: Option<bool>,
    pub gamescope: Option<bool>,
    pub gamescope_args: Option<String>,
    /// Config files swapped in for this game only, restored after the session.
    pub config_overrides: Option<Vec<FileOverride>>,
    pub mods_enabled: Option<bool>,
    /// Folders symlinked into place while mods are enabled.
    pub mod_links: Option<Vec<FileOverride>>,
    /// Emulator-specific raw options, e.g. Dolphin `-C` overrides or RetroArch cfg lines.
    pub advanced: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileOverride {
    /// Per-game file/folder owned by the launcher (or user).
    pub source: String,
    /// Location the emulator reads from.
    pub target: String,
}

macro_rules! merge_fields {
    ($out:ident, $over:ident, $($f:ident),*) => { $( if $over.$f.is_some() { $out.$f = $over.$f.clone(); } )* };
}

impl GameSettings {
    /// Return `self` overlaid with every `Some` field from `over`.
    pub fn overlay(&self, over: &GameSettings) -> GameSettings {
        let mut out = self.clone();
        merge_fields!(
            out, over, emulator_id, core, graphics_api, resolution_scale, vsync, fps_limit,
            aspect_ratio, screen_layout, fullscreen, docked_mode, scaling_filter, boot_mode,
            render_3d, cpu_overclock, input_profile, launch_args, env, gamemode, mangohud,
            gamescope, gamescope_args, config_overrides, mods_enabled, mod_links, advanced
        );
        out
    }
}
