//! Static registry of every gaming platform the launcher knows about.
//!
//! Adding a new console only requires adding an entry to [`PLATFORMS`]
//! (and optionally emulator presets in `emulators.rs`).

use serde::Serialize;

/// Visual style used by the UI to render a game as a collectible item.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ArtStyle {
    CartNes,
    CartSnes,
    CartN64,
    CartGb,
    CartGba,
    CartSega,
    CartGeneric,
    CardDs,
    Card3ds,
    CardSwitch,
    CardVita,
    DiscCd,
    DiscDvd,
    DiscBd,
    DiscMini,
    Umd,
    Digital,
}

/// How a platform's games are physically distributed (used for grouping/labels).
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Media {
    Cartridge,
    Card,
    Disc,
    Digital,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Platform {
    pub id: &'static str,
    pub name: &'static str,
    pub short_name: &'static str,
    pub manufacturer: &'static str,
    pub year: u16,
    pub media: Media,
    pub art_style: ArtStyle,
    /// File extensions (lowercase, without dot) that can belong to this platform.
    pub extensions: &'static [&'static str],
    /// Folder names (normalised: lowercase alphanumerics) identifying this platform.
    pub aliases: &'static [&'static str],
    /// Primary / secondary theme colours used by the UI.
    pub color: &'static str,
    pub accent: &'static str,
}

/// Extensions too generic to infer a platform from on their own; a folder alias is required.
pub const AMBIGUOUS_EXTENSIONS: &[&str] = &[
    "iso", "chd", "bin", "cue", "img", "zip", "7z", "m3u", "cso", "zso", "pbp", "elf", "ccd",
    "mds", "rom", "dsk", "gz", "ecm",
];

macro_rules! p {
    ($id:expr, $name:expr, $short:expr, $man:expr, $year:expr, $media:ident, $art:ident,
     [$($ext:expr),*], [$($alias:expr),*], $color:expr, $accent:expr) => {
        Platform {
            id: $id, name: $name, short_name: $short, manufacturer: $man, year: $year,
            media: Media::$media, art_style: ArtStyle::$art,
            extensions: &[$($ext),*], aliases: &[$($alias),*],
            color: $color, accent: $accent,
        }
    };
}

pub static PLATFORMS: &[Platform] = &[
    // ── PC ────────────────────────────────────────────────────────────────
    p!("steam", "Steam", "Steam", "Valve", 2003, Digital, Digital, [], ["steam"], "#1b2838", "#66c0f4"),
    p!("pc", "PC Games", "PC", "PC", 1981, Digital, Digital, [], ["pc", "windows", "linux"], "#1a1d29", "#9aa4ff"),
    // ── Nintendo ──────────────────────────────────────────────────────────
    p!("nes", "Nintendo Entertainment System", "NES", "Nintendo", 1983, Cartridge, CartNes,
       ["nes", "fds", "unf", "unif"], ["nes", "famicom", "fc", "fds", "nintendo"], "#7d7d7d", "#d62c2c"),
    p!("snes", "Super Nintendo", "SNES", "Nintendo", 1990, Cartridge, CartSnes,
       ["sfc", "smc", "fig", "swc", "bs"], ["snes", "sfc", "superfamicom", "supernintendo", "supernes"], "#5b4ea0", "#c7c3d9"),
    p!("n64", "Nintendo 64", "N64", "Nintendo", 1996, Cartridge, CartN64,
       ["n64", "z64", "v64", "ndd"], ["n64", "nintendo64"], "#1f8a3d", "#e8b923"),
    p!("gb", "Game Boy", "Game Boy", "Nintendo", 1989, Cartridge, CartGb,
       ["gb"], ["gb", "gameboy"], "#8b956d", "#3a3f2f"),
    p!("gbc", "Game Boy Color", "GBC", "Nintendo", 1998, Cartridge, CartGb,
       ["gbc"], ["gbc", "gameboycolor"], "#6a2c91", "#f2c94c"),
    p!("gba", "Game Boy Advance", "GBA", "Nintendo", 2001, Cartridge, CartGba,
       ["gba"], ["gba", "gameboyadvance"], "#3b3fa8", "#9aa0ff"),
    p!("nds", "Nintendo DS", "DS", "Nintendo", 2004, Card, CardDs,
       ["nds", "dsi", "ids"], ["nds", "ds", "nintendods"], "#4a4f5c", "#d9dde6"),
    p!("n3ds", "Nintendo 3DS", "3DS", "Nintendo", 2011, Card, Card3ds,
       ["3ds", "cci", "cxi", "3dsx", "cia"], ["3ds", "n3ds", "nintendo3ds"], "#c8102e", "#f5f5f5"),
    p!("gc", "Nintendo GameCube", "GameCube", "Nintendo", 2001, Disc, DiscMini,
       ["gcm", "gcz", "ciso", "dol"], ["gc", "gamecube", "ngc", "nintendogamecube"], "#4b3b8f", "#a594f9"),
    p!("wii", "Nintendo Wii", "Wii", "Nintendo", 2006, Disc, DiscDvd,
       ["wbfs", "wad", "rvz", "wia"], ["wii", "nintendowii"], "#d7dde4", "#3bb4e5"),
    p!("wiiu", "Nintendo Wii U", "Wii U", "Nintendo", 2012, Disc, DiscBd,
       ["wua", "wud", "wux", "rpx"], ["wiiu", "nintendowiiu"], "#0099cc", "#e6f7ff"),
    p!("switch", "Nintendo Switch", "Switch", "Nintendo", 2017, Card, CardSwitch,
       ["nsp", "xci", "nsz", "xcz"], ["switch", "nsw", "nintendoswitch", "ns"], "#e60012", "#00c3e3"),
    p!("switch2", "Nintendo Switch 2", "Switch 2", "Nintendo", 2025, Card, CardSwitch,
       [], ["switch2", "ns2", "nintendoswitch2"], "#2b2b2b", "#e60012"),
    p!("virtualboy", "Virtual Boy", "Virtual Boy", "Nintendo", 1995, Cartridge, CartGeneric,
       ["vb"], ["virtualboy", "vb"], "#5a0000", "#ff2a2a"),
    // ── Sony ──────────────────────────────────────────────────────────────
    p!("psx", "PlayStation", "PS1", "Sony", 1994, Disc, DiscCd,
       ["pbp"], ["psx", "ps1", "playstation", "playstation1", "sonyplaystation"], "#8c8c8c", "#e2e2e2"),
    p!("ps2", "PlayStation 2", "PS2", "Sony", 2000, Disc, DiscDvd,
       [], ["ps2", "playstation2"], "#00205b", "#4e8cff"),
    p!("ps3", "PlayStation 3", "PS3", "Sony", 2006, Disc, DiscBd,
       [], ["ps3", "playstation3"], "#111111", "#c8c8c8"),
    p!("psp", "PlayStation Portable", "PSP", "Sony", 2004, Disc, Umd,
       [], ["psp", "playstationportable"], "#1a1a1a", "#7e8cff"),
    p!("psvita", "PlayStation Vita", "PS Vita", "Sony", 2011, Card, CardVita,
       ["vpk"], ["psvita", "vita", "playstationvita"], "#0a2a6b", "#46a0ff"),
    // ── Sega ──────────────────────────────────────────────────────────────
    p!("mastersystem", "Sega Master System", "Master System", "Sega", 1985, Cartridge, CartSega,
       ["sms"], ["mastersystem", "sms", "segamastersystem", "mark3"], "#202020", "#e31c23"),
    p!("megadrive", "Sega Mega Drive / Genesis", "Mega Drive", "Sega", 1988, Cartridge, CartSega,
       ["md", "gen", "smd"], ["megadrive", "genesis", "md", "segagenesis", "segamegadrive"], "#151515", "#d92f2f"),
    p!("segacd", "Sega CD / Mega-CD", "Sega CD", "Sega", 1991, Disc, DiscCd,
       [], ["segacd", "megacd"], "#1d1d1d", "#2f7bd9"),
    p!("sega32x", "Sega 32X", "32X", "Sega", 1994, Cartridge, CartSega,
       ["32x"], ["sega32x", "32x"], "#1d1d1d", "#f2c230"),
    p!("gamegear", "Sega Game Gear", "Game Gear", "Sega", 1990, Cartridge, CartSega,
       ["gg"], ["gamegear", "gg"], "#222222", "#2fa0d9"),
    p!("saturn", "Sega Saturn", "Saturn", "Sega", 1994, Disc, DiscCd,
       [], ["saturn", "segasaturn"], "#2a2a3a", "#8a8ad0"),
    p!("dreamcast", "Sega Dreamcast", "Dreamcast", "Sega", 1998, Disc, DiscCd,
       ["gdi", "cdi"], ["dreamcast", "dc", "segadreamcast"], "#e8e8e8", "#f26b1d"),
    // ── Microsoft ─────────────────────────────────────────────────────────
    p!("xbox", "Xbox", "Xbox", "Microsoft", 2001, Disc, DiscDvd,
       [], ["xbox", "originalxbox", "microsoftxbox"], "#0e3b0e", "#7ac143"),
    p!("xbox360", "Xbox 360", "Xbox 360", "Microsoft", 2005, Disc, DiscDvd,
       ["xex"], ["xbox360", "x360", "microsoftxbox360"], "#e6e6e6", "#5dc21e"),
    // ── Others ────────────────────────────────────────────────────────────
    p!("arcade", "Arcade", "Arcade", "Various", 1978, Cartridge, CartGeneric,
       [], ["arcade", "mame", "fbneo", "fba", "finalburn", "cps1", "cps2", "cps3"], "#2b0a3d", "#ff3fa4"),
    p!("neogeo", "Neo Geo", "Neo Geo", "SNK", 1990, Cartridge, CartGeneric,
       [], ["neogeo", "aes", "mvs"], "#111111", "#d4af37"),
    p!("ngp", "Neo Geo Pocket", "NGP", "SNK", 1998, Cartridge, CartGb,
       ["ngp", "ngc"], ["ngp", "ngpc", "neogeopocket", "neogeopocketcolor"], "#30304a", "#e0c35a"),
    p!("pcengine", "PC Engine / TurboGrafx-16", "PC Engine", "NEC", 1987, Card, CartGeneric,
       ["pce", "sgx"], ["pcengine", "tg16", "turbografx", "turbografx16", "pce"], "#f2f2f2", "#ff6a00"),
    p!("pcenginecd", "PC Engine CD", "PCE CD", "NEC", 1988, Disc, DiscCd,
       [], ["pcenginecd", "tgcd", "turbografxcd", "pcecd"], "#e8e8e8", "#ff8c3a"),
    p!("3do", "3DO Interactive Multiplayer", "3DO", "Panasonic", 1993, Disc, DiscCd,
       [], ["3do"], "#202020", "#c9a227"),
    p!("atari2600", "Atari 2600", "Atari 2600", "Atari", 1977, Cartridge, CartGeneric,
       ["a26"], ["atari2600", "2600", "atari"], "#3b2412", "#e07b39"),
    p!("atari7800", "Atari 7800", "Atari 7800", "Atari", 1986, Cartridge, CartGeneric,
       ["a78"], ["atari7800", "7800"], "#1b1b1b", "#c0392b"),
    p!("lynx", "Atari Lynx", "Lynx", "Atari", 1989, Cartridge, CartGb,
       ["lnx"], ["lynx", "atarilynx"], "#222222", "#e8a33d"),
    p!("jaguar", "Atari Jaguar", "Jaguar", "Atari", 1993, Cartridge, CartGeneric,
       ["j64", "jag"], ["jaguar", "atarijaguar"], "#101010", "#d0312d"),
    p!("wonderswan", "WonderSwan", "WonderSwan", "Bandai", 1999, Cartridge, CartGb,
       ["ws", "wsc"], ["wonderswan", "wonderswancolor", "ws", "wsc"], "#2a3550", "#7fb2ff"),
    p!("msx", "MSX", "MSX", "Microsoft / ASCII", 1983, Cartridge, CartGeneric,
       ["mx1", "mx2"], ["msx", "msx2"], "#1a1a40", "#5a7dff"),
    p!("c64", "Commodore 64", "C64", "Commodore", 1982, Cartridge, CartGeneric,
       ["d64", "t64", "prg", "crt", "tap"], ["c64", "commodore64"], "#40318d", "#7869c4"),
    p!("pokemini", "Pokémon Mini", "Poké Mini", "Nintendo", 2001, Cartridge, CartGb,
       ["min"], ["pokemini"], "#1f3a5f", "#ffcb05"),
];

pub fn get(id: &str) -> Option<&'static Platform> {
    PLATFORMS.iter().find(|p| p.id == id)
}

/// Normalise a folder name for alias matching: lowercase alphanumerics only.
pub fn normalise(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

/// Find the platform whose alias matches the given (raw) folder name.
pub fn by_alias(folder: &str) -> Option<&'static Platform> {
    let n = normalise(folder);
    if n.is_empty() {
        return None;
    }
    PLATFORMS
        .iter()
        .filter(|p| p.id != "steam")
        .find(|p| p.aliases.iter().any(|a| *a == n))
}

/// Infer the platform from an extension alone (only for unambiguous extensions).
pub fn by_extension(ext: &str) -> Option<&'static Platform> {
    if AMBIGUOUS_EXTENSIONS.contains(&ext) {
        return None;
    }
    PLATFORMS.iter().find(|p| p.extensions.contains(&ext))
}

/// Extensions that are valid game files for a platform once its folder is known.
/// Includes generic disc/archive formats relevant to that platform.
pub fn accepts_extension(platform: &Platform, ext: &str) -> bool {
    if platform.extensions.contains(&ext) {
        return true;
    }
    let generic: &[&str] = match platform.id {
        "psx" => &["cue", "chd", "m3u", "pbp", "img", "ecm", "mds", "ccd", "iso", "bin"],
        "ps2" => &["iso", "chd", "cso", "zso", "gz", "elf", "m3u", "bin", "cue"],
        "ps3" => &["iso"],
        "psp" => &["iso", "cso", "pbp", "chd", "elf"],
        "gc" => &["iso", "rvz", "wia"],
        "wii" => &["iso", "ciso", "gcz"],
        "segacd" | "saturn" | "pcenginecd" | "3do" => &["cue", "chd", "iso", "m3u", "ccd", "mds"],
        "dreamcast" => &["chd", "m3u", "cue"],
        "xbox" | "xbox360" => &["iso"],
        "switch2" => &["nsp", "xci", "nsz", "xcz"],
        "arcade" | "neogeo" => &["zip", "7z", "chd"],
        "megadrive" | "mastersystem" | "gamegear" | "sega32x" => &["bin", "zip", "7z"],
        "msx" => &["rom", "dsk", "zip"],
        _ => &["zip", "7z"],
    };
    generic.contains(&ext)
}
