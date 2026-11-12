//! Emulator presets, auto-detection and command-line construction.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::models::{Emulator, Game};
use crate::settings::GameSettings;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: &'static str,
    pub name: &'static str,
    pub platforms: &'static [&'static str],
    pub binaries: &'static [&'static str],
    pub flatpaks: &'static [&'static str],
    /// Lowercase filename prefixes for AppImages.
    pub appimages: &'static [&'static str],
    pub args: &'static str,
    /// Generic settings this emulator can receive from the launcher.
    pub supports: &'static [&'static str],
    pub notes: &'static str,
}

macro_rules! preset {
    ($id:expr, $name:expr, [$($p:expr),*], [$($b:expr),*], [$($f:expr),*], [$($a:expr),*], $args:expr, [$($s:expr),*], $notes:expr) => {
        Preset { id: $id, name: $name, platforms: &[$($p),*], binaries: &[$($b),*], flatpaks: &[$($f),*],
                 appimages: &[$($a),*], args: $args, supports: &[$($s),*], notes: $notes }
    };
}

pub static PRESETS: &[Preset] = &[
    preset!("retroarch", "RetroArch",
        ["nes", "snes", "n64", "gb", "gbc", "gba", "nds", "virtualboy", "psx", "psp", "mastersystem", "megadrive",
         "segacd", "sega32x", "gamegear", "saturn", "dreamcast", "arcade", "neogeo", "ngp", "pcengine", "pcenginecd",
         "3do", "atari2600", "atari7800", "lynx", "jaguar", "wonderswan", "msx", "c64", "pokemini"],
        ["retroarch"], ["org.libretro.RetroArch"], ["retroarch"],
        "-L {core} {settings} {rom}",
        ["core", "graphicsApi", "vsync", "aspectRatio", "screenLayout", "bootMode", "fullscreen", "advanced"],
        "Per-game options are written to a temporary config passed with --appendconfig. Advanced lines use RetroArch cfg syntax: key = \"value\"."),
    preset!("duckstation", "DuckStation", ["psx"],
        ["duckstation-qt", "duckstation"], ["org.duckstation.DuckStation"], ["duckstation"],
        "{settings} -batch -- {rom}", ["fullscreen"],
        "DuckStation keeps its own per-game settings (Game Properties); the launcher controls fullscreen/batch mode."),
    preset!("pcsx2", "PCSX2", ["ps2"],
        ["pcsx2-qt", "pcsx2"], ["net.pcsx2.PCSX2"], ["pcsx2"],
        "{settings} -batch -- {rom}", ["fullscreen"],
        "PCSX2 stores per-game settings in its gamesettings folder; use Config Overrides for full control."),
    preset!("rpcs3", "RPCS3", ["ps3"],
        ["rpcs3"], ["net.rpcs3.RPCS3"], ["rpcs3"],
        "--no-gui {settings} {rom}", ["advanced"],
        "Advanced entries are passed as raw arguments (e.g. --config /path/custom.yml)."),
    preset!("ppsspp", "PPSSPP", ["psp"],
        ["PPSSPPSDL", "ppsspp", "PPSSPPQt", "ppsspp-sdl", "ppsspp-qt"], ["org.ppsspp.PPSSPP"], ["ppsspp"],
        "{settings} {rom}", ["fullscreen", "graphicsApi"], ""),
    preset!("vita3k", "Vita3K", ["psvita"],
        ["Vita3K", "vita3k"], [], ["vita3k"],
        "{settings} {rom}", ["fullscreen"],
        "Installed titles are launched by title id (-r). Unrecognised items are passed as a path."),
    preset!("dolphin", "Dolphin", ["gc", "wii"],
        ["dolphin-emu", "dolphin-emu-nogui"], ["org.DolphinEmu.dolphin-emu"], ["dolphin"],
        "-b {settings} -e {rom}",
        ["graphicsApi", "resolutionScale", "vsync", "aspectRatio", "fullscreen", "cpuOverclock", "render3d", "advanced"],
        "Settings are applied through Dolphin -C overrides (never written to your global config). Advanced: System.Section.Key=Value."),
    preset!("cemu", "Cemu", ["wiiu"],
        ["cemu", "Cemu"], ["info.cemu.Cemu"], ["cemu"],
        "{settings} -g {rom}", ["fullscreen"], ""),
    preset!("ryujinx", "Ryujinx (Ryubing)", ["switch"],
        ["ryujinx", "Ryujinx"], ["io.github.ryubing.Ryujinx", "org.ryujinx.Ryujinx"], ["ryujinx", "ryubing"],
        "{settings} {rom}", ["fullscreen", "graphicsApi"], ""),
    preset!("eden", "Eden", ["switch"],
        ["eden", "eden-cli"], ["dev.eden_emu.eden"], ["eden"],
        "{settings} -g {rom}", ["fullscreen", "dockedMode", "resolutionScale", "scalingFilter", "advanced"], ""),
    preset!("citron", "Citron", ["switch"],
        ["citron"], ["org.citron_emu.citron"], ["citron"],
        "{settings} -g {rom}", ["fullscreen", "dockedMode", "resolutionScale", "scalingFilter", "advanced"], ""),
    preset!("sudachi", "Sudachi", ["switch"],
        ["sudachi"], [], ["sudachi"],
        "{settings} -g {rom}", ["fullscreen", "dockedMode", "resolutionScale", "scalingFilter", "advanced"], ""),
    preset!("azahar", "Azahar", ["n3ds"],
        ["azahar", "azahar-qt"], ["org.azahar_emu.Azahar"], ["azahar"],
        "{settings} {rom}",
        ["fullscreen", "screenLayout", "screenRotation", "swapScreens", "screenGap", "resolutionScale", "graphicsApi", "scalingFilter", "aspectRatio", "vsync", "render3d", "cpuOverclock", "advanced"],
        "Custom Henosis build with direct CLI flags for layout, rotation, screen swap, resolution scale, 3D mode, and pre-configured SDL gamepad support."),
    preset!("lime3ds", "Lime3DS", ["n3ds"],
        ["lime3ds", "lime3ds-gui"], ["io.github.lime3ds.Lime3DS"], ["lime3ds"],
        "{settings} {rom}", ["fullscreen", "screenLayout", "resolutionScale", "render3d", "advanced"], ""),
    preset!("melonds", "melonDS", ["nds"],
        ["melonDS", "melonds"], ["net.kuribo64.melonDS"], ["melonds"],
        "{settings} {rom}",
        ["fullscreen", "screenLayout", "screenRotation", "swapScreens", "screenGap", "bootMode", "resolutionScale", "graphicsApi", "scalingFilter", "vsync", "advanced"],
        "Custom Henosis build with direct CLI flags for layout, sizing, rotation, screen gap/swap, OpenGL scale, and pre-configured SDL gamepad support."),
    preset!("mgba", "mGBA", ["gba", "gb", "gbc"],
        ["mgba-qt", "mgba"], ["io.mgba.mGBA"], ["mgba"],
        "{settings} {rom}", ["fullscreen"], ""),
    preset!("flycast", "Flycast", ["dreamcast", "arcade"],
        ["flycast"], ["org.flycast.Flycast"], ["flycast"],
        "{settings} {rom}", ["fullscreen", "advanced"],
        "Advanced entries become -config section:key=value overrides."),
    preset!("xemu", "xemu", ["xbox"],
        ["xemu"], ["app.xemu.xemu"], ["xemu"],
        "{settings} -dvd_path {rom}", ["fullscreen"],
        "Requires your own MCPX boot ROM, flash BIOS and HDD image configured inside xemu."),
    preset!("xenia", "Xenia Canary", ["xbox360"],
        ["xenia_canary", "xenia-canary", "xenia"], [], ["xenia"],
        "{settings} {rom}", ["fullscreen"],
        "The Linux build is experimental; you can also point this to a Wine wrapper script."),
    preset!("mednafen", "Mednafen", ["psx", "saturn", "pcengine", "pcenginecd", "gb", "gbc", "gba", "nes", "snes",
        "megadrive", "mastersystem", "gamegear", "lynx", "ngp", "wonderswan", "virtualboy"],
        ["mednafen"], [], [], "{settings} {rom}", ["fullscreen"], ""),
    preset!("mame", "MAME", ["arcade", "neogeo"],
        ["mame"], ["org.mamedev.MAME"], [],
        "{settings} -rompath {rom_dir} {rom_stem}", ["fullscreen"], ""),
    preset!("custom", "Custom Emulator", [], [], [], [], "{rom}", ["advanced"],
        "Any executable. Tokens: {rom} {path} {rom_dir} {rom_stem} {bios} {serial} {settings}."),
];

pub fn preset(id: &str) -> Option<&'static Preset> {
    PRESETS.iter().find(|p| p.id == id)
}

/// Preferred RetroArch cores per platform (first installed wins).
pub fn default_cores(platform: &str) -> &'static [&'static str] {
    match platform {
        "nes" => &["mesen", "nestopia", "fceumm", "quicknes"],
        "snes" => &["snes9x", "bsnes", "bsnes_hd_beta", "mesen-s"],
        "n64" => &["mupen64plus_next", "parallel_n64"],
        "gb" | "gbc" => &["gambatte", "sameboy", "gearboy", "mgba"],
        "gba" => &["mgba", "vba_next", "vbam", "gpsp"],
        "nds" => &["melondsds", "melonds", "desmume"],
        "virtualboy" => &["mednafen_vb"],
        "psx" => &["swanstation", "mednafen_psx_hw", "mednafen_psx", "pcsx_rearmed"],
        "psp" => &["ppsspp"],
        "mastersystem" | "megadrive" | "segacd" | "gamegear" => &["genesis_plus_gx", "picodrive"],
        "sega32x" => &["picodrive"],
        "saturn" => &["mednafen_saturn", "yabasanshiro", "kronos"],
        "dreamcast" => &["flycast"],
        "arcade" => &["fbneo", "mame", "mame2003_plus"],
        "neogeo" => &["fbneo", "geolith"],
        "ngp" => &["mednafen_ngp"],
        "pcengine" | "pcenginecd" => &["mednafen_pce", "mednafen_pce_fast"],
        "3do" => &["opera"],
        "atari2600" => &["stella", "stella2014"],
        "atari7800" => &["prosystem"],
        "lynx" => &["handy", "mednafen_lynx"],
        "jaguar" => &["virtualjaguar"],
        "wonderswan" => &["mednafen_wswan"],
        "msx" => &["bluemsx", "fmsx"],
        "c64" => &["vice_x64sc", "vice_x64"],
        "pokemini" => &["pokemini"],
        _ => &[],
    }
}

pub fn default_cores_dirs(emu: &Emulator) -> Vec<PathBuf> {
    let mut dirs_out = Vec::new();
    if let Some(d) = &emu.cores_dir {
        dirs_out.push(PathBuf::from(d));
    }
    if let Some(home) = dirs::home_dir() {
        if emu.kind == "flatpak" {
            dirs_out.push(home.join(".var/app/org.libretro.RetroArch/config/retroarch/cores"));
        }
        dirs_out.push(home.join(".config/retroarch/cores"));
    }
    dirs_out.push(PathBuf::from("/usr/lib/libretro"));
    dirs_out.push(PathBuf::from("/usr/lib64/libretro"));
    dirs_out
}

/// List installed RetroArch core names for an emulator entry.
pub fn installed_cores(emu: &Emulator) -> Vec<String> {
    let mut set = HashSet::new();
    for d in default_cores_dirs(emu) {
        if let Ok(rd) = std::fs::read_dir(d) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                if let Some(core) = n.strip_suffix("_libretro.so") {
                    set.insert(core.to_string());
                }
            }
        }
    }
    let mut v: Vec<String> = set.into_iter().collect();
    v.sort();
    v
}

fn find_core(emu: &Emulator, name: &str) -> Option<PathBuf> {
    default_cores_dirs(emu).into_iter().map(|d| d.join(format!("{name}_libretro.so"))).find(|p| p.is_file())
}

// ── Detection ───────────────────────────────────────────────────────────────

fn short_hash(s: &str) -> String {
    let mut h: u64 = 1469598103934665603;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(1099511628211);
    }
    format!("{:08x}", (h >> 32) as u32)
}

fn make(preset: &Preset, exec: String, kind: &str) -> Emulator {
    let label = match kind {
        "flatpak" => format!("{} (Flatpak)", preset.name),
        "appimage" => format!("{} (AppImage)", preset.name),
        _ => preset.name.to_string(),
    };
    Emulator {
        id: format!("{}-{}", preset.id, short_hash(&exec)),
        preset: preset.id.to_string(),
        name: label,
        exec,
        kind: kind.to_string(),
        version: None,
        platforms: preset.platforms.iter().map(|s| s.to_string()).collect(),
        args: preset.args.to_string(),
        workdir: None,
        cores_dir: None,
    }
}

fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    p.is_file() && p.metadata().map(|m| m.permissions().mode() & 0o111 != 0).unwrap_or(false)
}

pub fn which(bin: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|d| d.join(bin)).find(|p| is_executable(p))
}

pub fn flatpak_apps() -> HashSet<String> {
    std::process::Command::new("flatpak")
        .args(["list", "--app", "--columns=application"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).lines().map(|l| l.trim().to_string()).collect())
        .unwrap_or_default()
}

/// Scan PATH, Flatpak and the given folders (plus common AppImage folders) for known emulators.
pub fn detect(extra_dirs: &[String]) -> Vec<Emulator> {
    let mut found: Vec<Emulator> = Vec::new();
    let mut seen_exec = HashSet::new();
    let mut push = |e: Emulator, found: &mut Vec<Emulator>| {
        if seen_exec.insert(e.exec.clone()) {
            found.push(e);
        }
    };

    // System binaries
    for p in PRESETS {
        for b in p.binaries {
            if let Some(path) = which(b) {
                push(make(p, path.to_string_lossy().to_string(), "binary"), &mut found);
                break;
            }
        }
    }

    // Flatpaks
    let flatpaks = flatpak_apps();
    for p in PRESETS {
        for f in p.flatpaks {
            if flatpaks.contains(*f) {
                push(make(p, f.to_string(), "flatpak"), &mut found);
            }
        }
    }

    // AppImages and portable builds
    let home = dirs::home_dir().unwrap_or_default();
    let mut search: Vec<PathBuf> = extra_dirs.iter().map(PathBuf::from).collect();
    for d in [
        "Documents/Games/Emulators",
        "Documents/Games",
        "Applications",
        "AppImages",
        "Apps",
        "Emulators",
        "Emulation",
        ".local/bin",
        "Games",
        "Downloads",
    ] {
        search.push(home.join(d));
    }
    search.push(PathBuf::from("/opt"));
    // First pass: native portable binaries (preferred over AppImages)
    for dir in search.iter().filter(|d| d.is_dir()) {
        for e in walkdir::WalkDir::new(dir).max_depth(3).follow_links(true).into_iter().flatten() {
            if !e.file_type().is_file() && !e.file_type().is_symlink() {
                continue;
            }
            let name = e.file_name().to_string_lossy().to_string();
            let path = e.path();
            for p in PRESETS {
                if p.binaries.iter().any(|b| *b == name) && is_executable(path) {
                    push(make(p, path.to_string_lossy().to_string(), "binary"), &mut found);
                    break;
                }
            }
        }
    }
    // Second pass: AppImages
    for dir in search.iter().filter(|d| d.is_dir()) {
        for e in walkdir::WalkDir::new(dir).max_depth(3).follow_links(true).into_iter().flatten() {
            if !e.file_type().is_file() && !e.file_type().is_symlink() {
                continue;
            }
            let name = e.file_name().to_string_lossy().to_string();
            let lower = name.to_lowercase();
            let path = e.path();
            for p in PRESETS {
                let is_appimage = lower.ends_with(".appimage") && p.appimages.iter().any(|a| lower.starts_with(a));
                if is_appimage {
                    push(make(p, path.to_string_lossy().to_string(), "appimage"), &mut found);
                    break;
                }
            }
        }
    }
    found
}

// ── Command construction ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandSpec {
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub workdir: Option<String>,
}

impl CommandSpec {
    pub fn display(&self) -> String {
        let mut parts: Vec<String> = self.env.iter().map(|(k, v)| format!("{k}={}", quote(v))).collect();
        parts.push(quote(&self.program));
        parts.extend(self.args.iter().map(|a| quote(a)));
        parts.join(" ")
    }
}

fn quote(s: &str) -> String {
    if s.chars().any(|c| c.is_whitespace() || "'\"$&|;<>()".contains(c)) {
        format!("'{}'", s.replace('\'', "'\\''"))
    } else {
        s.to_string()
    }
}

/// Split a command-line template into words, honouring single/double quotes.
pub fn shell_split(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_word = false;
    let mut quote: Option<char> = None;
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some('"'), '\\') => {
                if let Some(n) = chars.next() {
                    cur.push(n);
                }
            }
            (Some(_), c) => cur.push(c),
            (None, '"') | (None, '\'') => {
                quote = Some(c);
                in_word = true;
            }
            (None, '\\') => {
                if let Some(n) = chars.next() {
                    cur.push(n);
                    in_word = true;
                }
            }
            (None, c) if c.is_whitespace() => {
                if in_word {
                    out.push(std::mem::take(&mut cur));
                    in_word = false;
                }
            }
            (None, c) => {
                cur.push(c);
                in_word = true;
            }
        }
    }
    if in_word {
        out.push(cur);
    }
    out
}

pub struct BuildContext<'a> {
    pub game: &'a Game,
    pub settings: &'a GameSettings,
    pub bios_dir: Option<&'a str>,
    /// Directory for temporary per-launch files.
    pub run_dir: &'a Path,
    /// RetroAchievements (username, token, hardcore), when logged in.
    pub ra: Option<(String, String, bool)>,
}

/// Build the full command (wrappers + emulator + arguments) for a game.
pub fn build_command(emu: &Emulator, ctx: &BuildContext) -> Result<CommandSpec, String> {
    let game = ctx.game;
    let s = ctx.settings;
    let path = Path::new(&game.path);
    let fullscreen = s.fullscreen.unwrap_or(true);
    let mut env: Vec<(String, String)> = Vec::new();

    // Adapter-specific settings arguments and target override
    let mut settings_args: Vec<String> = Vec::new();
    let mut target: Vec<String> = vec![game.path.clone()];
    let mut core_path = String::new();

    match emu.preset.as_str() {
        "retroarch" => {
            let candidates: Vec<String> = match &s.core {
                Some(c) => vec![c.clone()],
                None => default_cores(&game.platform).iter().map(|s| s.to_string()).collect(),
            };
            let core = candidates.iter().find_map(|c| find_core(emu, c)).ok_or_else(|| {
                format!(
                    "No RetroArch core found for this platform. Install one of: {}",
                    if candidates.is_empty() { "(none known)".into() } else { candidates.join(", ") }
                )
            })?;
            core_path = core.to_string_lossy().to_string();
            let mut cfg = vec![format!("video_fullscreen = \"{fullscreen}\"")];
            if let Some(api) = &s.graphics_api {
                let driver = match api.as_str() {
                    "vulkan" => "vulkan",
                    "opengl" => "glcore",
                    "software" => "sdl2",
                    other => other,
                };
                cfg.push(format!("video_driver = \"{driver}\""));
            }
            if let Some(v) = s.vsync {
                cfg.push(format!("video_vsync = \"{v}\""));
            }
            match s.aspect_ratio.as_deref() {
                Some("auto") => cfg.push("video_aspect_ratio_auto = \"true\"".into()),
                Some("4:3") => cfg.extend(["video_aspect_ratio_auto = \"false\"".into(), "aspect_ratio_index = \"0\"".into()]),
                Some("16:9") => cfg.extend(["video_aspect_ratio_auto = \"false\"".into(), "aspect_ratio_index = \"1\"".into()]),
                Some("stretch") => cfg.extend(["video_aspect_ratio_auto = \"false\"".into(), "video_scale_integer = \"false\"".into(), "aspect_ratio_index = \"24\"".into()]),
                _ => {}
            }
            if let Some(layout) = s.screen_layout.as_deref() {
                match layout {
                    "top-bottom" => {
                        cfg.push("melonds_screen_layout = \"Top/Bottom\"".into());
                        cfg.push("desmume_screens_layout = \"top/bottom\"".into());
                        cfg.push("citra_layout_option = \"Default\"".into());
                    }
                    "side-by-side" => {
                        cfg.push("melonds_screen_layout = \"Left/Right\"".into());
                        cfg.push("desmume_screens_layout = \"left/right\"".into());
                        cfg.push("citra_layout_option = \"Side by Side\"".into());
                    }
                    "hybrid" => {
                        cfg.push("melonds_screen_layout = \"Hybrid Top\"".into());
                        cfg.push("desmume_screens_layout = \"hybrid/top\"".into());
                        cfg.push("citra_layout_option = \"Large Screen\"".into());
                    }
                    "single-top" => {
                        cfg.push("melonds_screen_layout = \"Top Only\"".into());
                        cfg.push("desmume_screens_layout = \"top only\"".into());
                        cfg.push("citra_layout_option = \"Single Screen\"".into());
                    }
                    "single-bottom" => {
                        cfg.push("melonds_screen_layout = \"Bottom Only\"".into());
                        cfg.push("desmume_screens_layout = \"bottom only\"".into());
                    }
                    _ => {}
                }
            }
            if let Some(boot) = s.boot_mode.as_deref() {
                match boot {
                    "direct" => {
                        cfg.push("melonds_boot_directly = \"enabled\"".into());
                        cfg.push("desmume_boot_into_bios = \"disabled\"".into());
                    }
                    "firmware" => {
                        cfg.push("melonds_boot_directly = \"disabled\"".into());
                        cfg.push("desmume_boot_into_bios = \"enabled\"".into());
                    }
                    _ => {}
                }
            }
            if let Some((user, token, hc)) = ctx.ra.as_ref() {
                cfg.push("cheevos_enable = \"true\"".into());
                cfg.push(format!("cheevos_username = \"{user}\""));
                cfg.push(format!("cheevos_token = \"{token}\""));
                cfg.push(format!("cheevos_hardcore_mode_enable = \"{}\"", if *hc { "true" } else { "false" }));
            }
            if let Some(adv) = &s.advanced {
                cfg.extend(adv.iter().filter(|l| !l.trim().is_empty()).cloned());
            }
            std::fs::create_dir_all(ctx.run_dir).map_err(|e| e.to_string())?;
            let file = ctx.run_dir.join(format!("retroarch-{}.cfg", game.id));
            std::fs::write(&file, cfg.join("\n") + "\n").map_err(|e| e.to_string())?;
            settings_args.push("--appendconfig".into());
            settings_args.push(file.to_string_lossy().to_string());
        }
        "dolphin" => {
            let mut c = |kv: String| {
                settings_args.push("-C".into());
                settings_args.push(kv);
            };
            c(format!("Dolphin.Display.Fullscreen={}", if fullscreen { "True" } else { "False" }));
            if let Some(api) = &s.graphics_api {
                let b = match api.as_str() {
                    "vulkan" => "Vulkan",
                    "opengl" => "OGL",
                    "software" => "Software Renderer",
                    o => o,
                };
                c(format!("Dolphin.Core.GFXBackend={b}"));
            }
            if let Some(scale) = s.resolution_scale {
                c(format!("GFX.Settings.InternalResolution={}", scale.clamp(1, 8)));
            }
            if let Some(v) = s.vsync {
                c(format!("GFX.Hardware.VSync={}", if v { "True" } else { "False" }));
            }
            if let Some(a) = s.aspect_ratio.as_deref() {
                let idx = match a {
                    "16:9" => 1,
                    "4:3" => 2,
                    "stretch" => 3,
                    _ => 0,
                };
                c(format!("GFX.Settings.AspectRatio={idx}"));
            }
            if let Some(oc) = s.cpu_overclock {
                if oc == 100 {
                    c("Core.OverclockEnable=False".into());
                    c("Core.Overclock=1.0".into());
                } else {
                    c("Core.OverclockEnable=True".into());
                    let mult = (oc as f32) / 100.0;
                    c(format!("Core.Overclock={:.2}", mult));
                }
            }
            if let Some(r3d) = s.render_3d.as_deref() {
                match r3d {
                    "side-by-side" => c("GFX.Stereoscopy.StereoMode=1".into()),
                    "anaglyph" => c("GFX.Stereoscopy.StereoMode=3".into()),
                    "off" => c("GFX.Stereoscopy.StereoMode=0".into()),
                    _ => {}
                }
            }
            for a in s.advanced.iter().flatten().filter(|l| !l.trim().is_empty()) {
                c(a.clone());
            }
        }
        "flycast" => {
            if fullscreen {
                settings_args.extend(["-config".into(), "window:fullscreen=yes".into()]);
            }
            for a in s.advanced.iter().flatten().filter(|l| !l.trim().is_empty()) {
                settings_args.extend(["-config".into(), a.clone()]);
            }
        }
        "duckstation" | "pcsx2" => settings_args.push(if fullscreen { "-fullscreen" } else { "-nofullscreen" }.into()),
        "cemu" | "mgba" => {
            if fullscreen {
                settings_args.push("-f".into());
            }
        }
        "melonds" => {
            if let Some((user, token, hc)) = ctx.ra.as_ref() {
                settings_args.extend([
                    "--ra-user".into(), user.clone(),
                    "--ra-token".into(), token.clone(),
                    "--ra-hardcore".into(), if *hc { "true" } else { "false" }.into(),
                ]);
            }
            if fullscreen {
                settings_args.push("-f".into());
            }
            if let Some(boot) = s.boot_mode.as_deref() {
                match boot {
                    "direct" => settings_args.extend(["-b".into(), "always".into()]),
                    "firmware" => settings_args.extend(["-b".into(), "never".into()]),
                    _ => {}
                }
            }
            if let Some(layout) = s.screen_layout.as_deref() {
                match layout {
                    "top-bottom" => {
                        settings_args.extend(["--layout".into(), "vertical".into(), "--sizing".into(), "even".into()]);
                    }
                    "side-by-side" => {
                        settings_args.extend(["--layout".into(), "horizontal".into(), "--sizing".into(), "even".into()]);
                    }
                    "hybrid" => {
                        settings_args.extend(["--layout".into(), "hybrid".into(), "--sizing".into(), "emph-top".into()]);
                    }
                    "large" | "emph-top" => {
                        settings_args.extend(["--layout".into(), "natural".into(), "--sizing".into(), "emph-top".into()]);
                    }
                    "emph-bottom" => {
                        settings_args.extend(["--layout".into(), "natural".into(), "--sizing".into(), "emph-bottom".into()]);
                    }
                    "single-top" => {
                        settings_args.extend(["--layout".into(), "single-top".into()]);
                    }
                    "single-bottom" => {
                        settings_args.extend(["--layout".into(), "single-bottom".into()]);
                    }
                    _ => {}
                }
            }
            if let Some(rot) = s.screen_rotation {
                settings_args.extend(["--rotation".into(), rot.to_string()]);
            }
            if let Some(swap) = s.swap_screens {
                settings_args.extend(["--swap-screens".into(), if swap { "true" } else { "false" }.into()]);
            }
            if let Some(gap) = s.screen_gap {
                settings_args.extend(["--gap".into(), gap.to_string()]);
            }
            if let Some(api) = s.graphics_api.as_deref() {
                match api {
                    "opengl" | "vulkan" => settings_args.extend(["--renderer".into(), "opengl".into()]),
                    "software" => settings_args.extend(["--renderer".into(), "software".into()]),
                    _ => {}
                }
            }
            if let Some(scale) = s.resolution_scale {
                settings_args.extend(["--scale".into(), scale.clamp(1, 16).to_string()]);
            }
            if let Some(filter) = s.scaling_filter.as_deref() {
                match filter {
                    "nearest" => {
                        settings_args.extend(["--filter".into(), "nearest".into(), "--integer-scale".into(), "true".into()]);
                    }
                    "bilinear" | "bicubic" | "scaleforce" | "fsr" => {
                        settings_args.extend(["--filter".into(), "linear".into()]);
                    }
                    _ => {}
                }
            }
            if let Some(vsync) = s.vsync {
                settings_args.extend(["--vsync".into(), if vsync { "true" } else { "false" }.into()]);
            }
            if let Some(home) = dirs::home_dir() {
                let toml_path = home.join(".config/melonDS/melonDS.toml");
                let mut updates = Vec::new();
                if let Some(layout) = s.screen_layout.as_deref() {
                    match layout {
                        "top-bottom" => {
                            updates.push(("Instance0.Window0", "ScreenLayout", "1"));
                            updates.push(("Instance0.Window0", "ScreenSizing", "0"));
                        }
                        "side-by-side" => {
                            updates.push(("Instance0.Window0", "ScreenLayout", "2"));
                            updates.push(("Instance0.Window0", "ScreenSizing", "0"));
                        }
                        "hybrid" => {
                            updates.push(("Instance0.Window0", "ScreenLayout", "3"));
                            updates.push(("Instance0.Window0", "ScreenSizing", "1"));
                        }
                        "large" | "emph-top" => {
                            updates.push(("Instance0.Window0", "ScreenLayout", "0"));
                            updates.push(("Instance0.Window0", "ScreenSizing", "1"));
                        }
                        "emph-bottom" => {
                            updates.push(("Instance0.Window0", "ScreenLayout", "0"));
                            updates.push(("Instance0.Window0", "ScreenSizing", "2"));
                        }
                        "single-top" => {
                            updates.push(("Instance0.Window0", "ScreenLayout", "0"));
                            updates.push(("Instance0.Window0", "ScreenSizing", "4"));
                        }
                        "single-bottom" => {
                            updates.push(("Instance0.Window0", "ScreenLayout", "0"));
                            updates.push(("Instance0.Window0", "ScreenSizing", "5"));
                        }
                        _ => {}
                    }
                }
                let scale_str;
                if let Some(scale) = s.resolution_scale {
                    if scale > 1 {
                        updates.push(("3D", "Renderer", "1"));
                        scale_str = scale.to_string();
                        updates.push(("3D.GL", "Scale", &scale_str));
                    } else {
                        updates.push(("3D", "Renderer", "0"));
                    }
                }
                if !updates.is_empty() {
                    let _ = update_toml_file(&toml_path, &updates);
                }
            }
        }
        "azahar" | "lime3ds" => {
            // Qt6 Wayland explicit-sync (wp_linux_drm_syncobj_surface_v1) crashes when
            // Azahar recreates/destroys surfaces during layout cycling; XWayland avoids it.
            if std::env::var_os("WAYLAND_DISPLAY").is_some() && std::env::var_os("QT_QPA_PLATFORM").is_none() {
                env.push(("QT_QPA_PLATFORM".into(), "xcb".into()));
            }
            if fullscreen {
                settings_args.push("-f".into());
            } else {
                settings_args.push("-w".into());
            }
            if emu.preset == "azahar" {
                if let Some(layout) = s.screen_layout.as_deref() {
                    settings_args.extend(["--layout".into(), layout.into()]);
                }
                if let Some(rot) = s.screen_rotation {
                    settings_args.extend(["--rotation".into(), rot.to_string()]);
                }
                if let Some(swap) = s.swap_screens {
                    settings_args.extend(["--swap-screens".into(), if swap { "1" } else { "0" }.into()]);
                }
                if let Some(gap) = s.screen_gap {
                    settings_args.extend(["--gap".into(), gap.to_string()]);
                }
                if let Some(scale) = s.resolution_scale {
                    settings_args.extend(["--scale".into(), scale.clamp(1, 10).to_string()]);
                }
                if let Some(api) = s.graphics_api.as_deref() {
                    settings_args.extend(["--graphics-api".into(), api.into()]);
                }
                if let Some(filter) = s.scaling_filter.as_deref() {
                    let f = match filter {
                        "scaleforce" => "scaleforce",
                        "bicubic" => "bicubic",
                        "fsr" => "anime4k",
                        "bilinear" => "linear",
                        "nearest" => "nearest",
                        other => other,
                    };
                    settings_args.extend(["--filter".into(), f.into()]);
                }
                if let Some(aspect) = s.aspect_ratio.as_deref() {
                    let a = match aspect {
                        "auto" => "default",
                        other => other,
                    };
                    settings_args.extend(["--aspect-ratio".into(), a.into()]);
                }
                if let Some(vsync) = s.vsync {
                    settings_args.extend(["--vsync".into(), if vsync { "1" } else { "0" }.into()]);
                }
                if let Some(r3d) = s.render_3d.as_deref() {
                    let m = match r3d {
                        "side-by-side" => "sbs",
                        "anaglyph" => "anaglyph",
                        _ => "off",
                    };
                    settings_args.extend(["--3d-mode".into(), m.into()]);
                }
                if let Some(oc) = s.cpu_overclock {
                    settings_args.extend(["--cpu-clock".into(), oc.to_string()]);
                }
            }
            if let Some(home) = dirs::home_dir() {
                let emu_name = if emu.preset == "lime3ds" { "lime3ds" } else { "azahar-emu" };
                let config_base = home.join(format!(".config/{emu_name}"));
                let mut updates = Vec::new();

                if s.screen_layout.as_deref() != Some("separate") {
                    // Exclude "4" (Separate Windows) & "6" (Custom) from R3 cycling in fullscreen.
                    updates.push(("Layout", "layouts_to_cycle", "0, 1, 2, 3, 5"));
                    updates.push(("Layout", "layouts_to_cycle\\default", "false"));
                }
                if let Some(layout) = s.screen_layout.as_deref() {
                    let opt = match layout {
                        "top-bottom" => "0",
                        "single-top" | "single-bottom" => "1",
                        "large" | "emph-top" | "emph-bottom" => "2",
                        "side-by-side" => "3",
                        "separate" => "4",
                        "hybrid" => "5",
                        _ => "0",
                    };
                    updates.push(("Layout", "layout_option", opt));
                    updates.push(("Layout", "layout_option\\default", "false"));
                    updates.push(("Layout", "layout_option\\use_global", "false"));
                    if layout == "single-bottom" || layout == "emph-bottom" {
                        updates.push(("Layout", "swap_screen", "true"));
                        updates.push(("Layout", "swap_screen\\default", "false"));
                        updates.push(("Layout", "swap_screen\\use_global", "false"));
                    }
                }
                if let Some(swap) = s.swap_screens {
                    updates.push(("Layout", "swap_screen", if swap { "true" } else { "false" }));
                    updates.push(("Layout", "swap_screen\\default", "false"));
                    updates.push(("Layout", "swap_screen\\use_global", "false"));
                }
                if let Some(rot) = s.screen_rotation {
                    let upright = rot == 90 || rot == 270;
                    updates.push(("Layout", "upright_screen", if upright { "true" } else { "false" }));
                    updates.push(("Layout", "upright_screen\\default", "false"));
                    updates.push(("Layout", "upright_screen\\use_global", "false"));
                }
                if let Some(r3d) = s.render_3d.as_deref() {
                    let opt = match r3d {
                        "off" => "0",
                        "side-by-side" => "1",
                        "anaglyph" => "3",
                        _ => "0",
                    };
                    updates.push(("Layout", "render_3d", opt));
                    updates.push(("Layout", "render_3d\\default", "false"));
                    updates.push(("Layout", "render_3d\\use_global", "false"));
                }
                let scale_str;
                if let Some(scale) = s.resolution_scale {
                    scale_str = scale.to_string();
                    updates.push(("Renderer", "resolution_factor", &scale_str));
                    updates.push(("Renderer", "resolution_factor\\default", "false"));
                    updates.push(("Renderer", "resolution_factor\\use_global", "false"));
                }

                if !updates.is_empty() {
                    let _ = update_ini_file(&config_base.join("qt-config.ini"), &updates);
                    if let Some(tid) = extract_title_id(game) {
                        let _ = update_ini_file(&config_base.join("custom").join(format!("{tid}.ini")), &updates);
                    }
                }
            }
        }
        "eden" | "citron" | "sudachi" => {
            if fullscreen {
                settings_args.push("-f".into());
            }
            if let Some(home) = dirs::home_dir() {
                let emu_name = emu.preset.as_str();
                let config_base = home.join(format!(".config/{emu_name}"));
                let portable_dir = Path::new(&emu.exec).parent().unwrap_or(Path::new("")).join(emu_name);
                let mut updates = Vec::new();

                if let Some(docked) = s.docked_mode {
                    let val = if docked { "true" } else { "false" };
                    updates.push(("System", "use_docked_mode", val));
                    updates.push(("System", "use_docked_mode\\default", "false"));
                    updates.push(("System", "use_docked_mode\\use_global", "false"));
                }
                let scale_str;
                if let Some(scale) = s.resolution_scale {
                    let setup_val = match scale {
                        1 => "2",
                        2 => "3",
                        3 => "4",
                        4 => "5",
                        _ => "2",
                    };
                    scale_str = setup_val.to_string();
                    updates.push(("Renderer", "resolution_setup", &scale_str));
                    updates.push(("Renderer", "resolution_setup\\default", "false"));
                    updates.push(("Renderer", "resolution_setup\\use_global", "false"));
                }
                if let Some(filter) = s.scaling_filter.as_deref() {
                    let opt = match filter {
                        "nearest" => "0",
                        "bilinear" => "1",
                        "bicubic" => "2",
                        "gaussian" => "3",
                        "scaleforce" => "4",
                        "fsr" => "5",
                        _ => "1",
                    };
                    updates.push(("Renderer", "scaling_filter", opt));
                    updates.push(("Renderer", "scaling_filter\\default", "false"));
                    updates.push(("Renderer", "scaling_filter\\use_global", "false"));
                    if filter == "fsr" {
                        updates.push(("Renderer", "fsr_sharpening_slider", "80"));
                        updates.push(("Renderer", "fsr_sharpening_slider\\use_global", "false"));
                    }
                }

                if !updates.is_empty() {
                    let _ = update_ini_file(&config_base.join("qt-config.ini"), &updates);
                    if portable_dir.is_dir() {
                        let _ = update_ini_file(&portable_dir.join("qt-config.ini"), &updates);
                    }
                    if let Some(tid) = extract_title_id(game) {
                        let _ = update_ini_file(&config_base.join("custom").join(format!("{tid}.ini")), &updates);
                        if portable_dir.is_dir() {
                            let _ = update_ini_file(&portable_dir.join("custom").join(format!("{tid}.ini")), &updates);
                        }
                    }
                }
            }
        }
        "ryujinx" => {
            if fullscreen {
                settings_args.push("--fullscreen".into());
            }
            if let Some(api) = &s.graphics_api {
                settings_args.push("--graphics-backend".into());
                settings_args.push(if api == "opengl" { "OpenGl".into() } else { "Vulkan".into() });
            }
        }
        "ppsspp" => {
            if fullscreen {
                settings_args.push("--fullscreen".into());
            }
            if let Some(api) = &s.graphics_api {
                settings_args.push(format!("--graphics={}", if api == "opengl" { "opengl" } else { "vulkan" }));
            }
        }
        "vita3k" => {
            if fullscreen {
                settings_args.push("-F".into());
            }
            if let Some(id) = &game.serial {
                target = vec!["-r".into(), id.clone()];
            }
        }
        "xemu" => {
            if fullscreen {
                settings_args.push("-full-screen".into());
            }
        }
        "xenia" => {
            if fullscreen {
                settings_args.push("--fullscreen=true".into());
            }
        }
        "mednafen" => {
            settings_args.extend(["-video.fs".into(), if fullscreen { "1".into() } else { "0".into() }]);
        }
        "mame" => settings_args.push(if fullscreen { "-nowindow" } else { "-window" }.into()),
        "rpcs3" => {
            let eboot = path.join("PS3_GAME/USRDIR/EBOOT.BIN");
            let hdd = path.join("USRDIR/EBOOT.BIN");
            if eboot.is_file() {
                target = vec![eboot.to_string_lossy().to_string()];
            } else if hdd.is_file() {
                target = vec![hdd.to_string_lossy().to_string()];
            }
            settings_args.extend(s.advanced.iter().flatten().filter(|l| !l.trim().is_empty()).cloned());
        }
        _ => {
            settings_args.extend(s.advanced.iter().flatten().flat_map(|l| shell_split(l)));
        }
    }

    // Expand the argument template
    let rom_dir = path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    let rom_stem = path.file_stem().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    let mut args: Vec<String> = Vec::new();
    for word in shell_split(&emu.args) {
        match word.as_str() {
            "{settings}" => args.extend(settings_args.iter().cloned()),
            "{rom}" => args.extend(target.iter().cloned()),
            _ => args.push(
                word.replace("{path}", &game.path)
                    .replace("{rom_dir}", &rom_dir)
                    .replace("{rom_stem}", &rom_stem)
                    .replace("{core}", &core_path)
                    .replace("{bios}", ctx.bios_dir.unwrap_or(""))
                    .replace("{serial}", game.serial.as_deref().unwrap_or(""))
                    .replace("{rom}", &game.path),
            ),
        }
    }
    if let Some(extra) = &s.launch_args {
        args.extend(shell_split(extra));
    }

    // Base program (Flatpak needs `flatpak run` and filesystem access to the game folder)
    let (program, mut full_args) = match emu.kind.as_str() {
        "flatpak" => {
            let mut a = vec!["run".to_string()];
            if !rom_dir.is_empty() {
                let dir = if path.is_dir() { game.path.clone() } else { rom_dir.clone() };
                a.push(format!("--filesystem={dir}:ro"));
            }
            if emu.preset == "retroarch" && !core_path.is_empty() {
                if let Some(d) = Path::new(&core_path).parent() {
                    a.push(format!("--filesystem={}:ro", d.to_string_lossy()));
                }
            }
            a.push(emu.exec.clone());
            ("flatpak".to_string(), a)
        }
        _ => (emu.exec.clone(), vec![]),
    };
    full_args.extend(args);

    wrap(program, full_args, s, &mut env, emu.workdir.clone())
}

/// Apply environment variables and gamescope / gamemode / MangoHud wrappers.
pub fn wrap(
    program: String,
    args: Vec<String>,
    s: &GameSettings,
    env: &mut Vec<(String, String)>,
    workdir: Option<String>,
) -> Result<CommandSpec, String> {
    for kv in s.env.iter().flatten() {
        if let Some((k, v)) = kv.split_once('=') {
            if !k.trim().is_empty() {
                env.push((k.trim().to_string(), v.to_string()));
            }
        }
    }
    let mut chain: Vec<String> = Vec::new();
    if s.gamescope == Some(true) {
        if which("gamescope").is_none() {
            return Err("gamescope is enabled but not installed".into());
        }
        chain.push("gamescope".into());
        let gs_args = s.gamescope_args.clone().unwrap_or_else(|| "-f".into());
        chain.extend(shell_split(&gs_args));
        if let Some(fps) = s.fps_limit.filter(|f| *f > 0) {
            chain.extend(["-r".into(), fps.to_string()]);
        }
        chain.push("--".into());
    }
    if s.gamemode == Some(true) && which("gamemoderun").is_some() {
        chain.push("gamemoderun".into());
    }
    if s.mangohud == Some(true) && which("mangohud").is_some() {
        chain.push("mangohud".into());
        if s.gamescope != Some(true) {
            if let Some(fps) = s.fps_limit.filter(|f| *f > 0) {
                env.push(("MANGOHUD_CONFIG".into(), format!("fps_limit={fps}")));
            }
        }
    }
    let spec = if chain.is_empty() {
        CommandSpec { program, args, env: env.clone(), workdir }
    } else {
        let p = chain.remove(0);
        chain.push(program);
        chain.extend(args);
        CommandSpec { program: p, args: chain, env: env.clone(), workdir }
    };
    Ok(spec)
}

fn extract_title_id(game: &Game) -> Option<String> {
    if let Some(s) = &game.serial {
        if s.len() == 16 && s.chars().all(|c| c.is_ascii_hexdigit()) {
            return Some(s.to_uppercase());
        }
    }
    let p = Path::new(&game.path);
    let stem = p.file_stem()?.to_string_lossy();
    for part in stem.split(|c| c == '[' || c == ']' || c == '(' || c == ')' || c == ' ' || c == '_') {
        let trimmed = part.trim();
        if trimmed.len() == 16 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
            return Some(trimmed.to_uppercase());
        }
    }
    None
}

fn update_ini_file(path: &Path, updates: &[(&str, &str, &str)]) -> std::io::Result<()> {
    let content = if path.exists() {
        std::fs::read_to_string(path).unwrap_or_default()
    } else {
        String::new()
    };
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    for (target_sec, target_key, target_val) in updates {
        let sec_header = format!("[{}]", target_sec);
        let mut sec_start = None;
        let mut sec_end = None;

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            if trimmed.eq_ignore_ascii_case(&sec_header) {
                sec_start = Some(i);
            } else if sec_start.is_some() && trimmed.starts_with('[') && trimmed.ends_with(']') {
                sec_end = Some(i);
                break;
            }
        }

        if let Some(start) = sec_start {
            let end = sec_end.unwrap_or(lines.len());
            let mut found_idx = None;
            for i in (start + 1)..end {
                let l = lines[i].trim();
                if let Some((k, _)) = l.split_once('=') {
                    if k.trim().eq_ignore_ascii_case(target_key) {
                        found_idx = Some(i);
                        break;
                    }
                }
            }

            let new_line = format!("{}={}", target_key, target_val);
            if let Some(idx) = found_idx {
                lines[idx] = new_line;
            } else {
                lines.insert(end, new_line);
            }
        } else {
            if !lines.is_empty() && !lines.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
                lines.push(String::new());
            }
            lines.push(sec_header);
            lines.push(format!("{}={}", target_key, target_val));
        }
    }

    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(path, lines.join("\n") + "\n")
}

fn update_toml_file(path: &Path, updates: &[(&str, &str, &str)]) -> std::io::Result<()> {
    let content = if path.exists() {
        std::fs::read_to_string(path).unwrap_or_default()
    } else {
        String::new()
    };
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    for (target_sec, target_key, target_val) in updates {
        let sec_header = format!("[{}]", target_sec);
        let mut sec_start = None;
        let mut sec_end = None;

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            if trimmed.eq_ignore_ascii_case(&sec_header) {
                sec_start = Some(i);
            } else if sec_start.is_some() && trimmed.starts_with('[') && trimmed.ends_with(']') {
                sec_end = Some(i);
                break;
            }
        }

        if let Some(start) = sec_start {
            let end = sec_end.unwrap_or(lines.len());
            let mut found_idx = None;
            for i in (start + 1)..end {
                let l = lines[i].trim();
                if let Some((k, _)) = l.split_once('=') {
                    if k.trim().eq_ignore_ascii_case(target_key) {
                        found_idx = Some(i);
                        break;
                    }
                }
            }

            let new_line = format!("{} = {}", target_key, target_val);
            if let Some(idx) = found_idx {
                lines[idx] = new_line;
            } else {
                lines.insert(end, new_line);
            }
        } else {
            if !lines.is_empty() && !lines.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
                lines.push(String::new());
            }
            lines.push(sec_header);
            lines.push(format!("{} = {}", target_key, target_val));
        }
    }

    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(path, lines.join("\n") + "\n")
}
