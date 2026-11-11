//! ROM / game-file discovery across user-configured directories.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::models::{ScanDir, ScannedGame};
use crate::platforms::{self, Platform};
use crate::sfo;

const SKIP_DIRS: &[&str] = &[
    "media", "images", "covers", "boxart", "screenshots", "videos", "manuals", "marquees", "bios",
    "saves", "states", "savestates", "snap", "snaps", "titles", "fanart", "downloaded_media", "cheats",
    "textures", "shaders", "system", "firmware", "keys", "updates", "dlc", "__macosx",
];

const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp"];

const REGIONS: &[(&str, &str)] = &[
    ("usa", "USA"), ("us", "USA"), ("u", "USA"), ("europe", "Europe"), ("eu", "Europe"), ("e", "Europe"),
    ("eur", "Europe"), ("pal", "Europe"), ("japan", "Japan"), ("jp", "Japan"), ("j", "Japan"),
    ("jpn", "Japan"), ("world", "World"), ("w", "World"), ("france", "France"), ("fr", "France"),
    ("germany", "Germany"), ("de", "Germany"), ("spain", "Spain"), ("italy", "Italy"), ("korea", "Korea"),
    ("brazil", "Brazil"), ("australia", "Australia"), ("asia", "Asia"), ("china", "China"),
    ("usa, europe", "USA / Europe"), ("japan, usa", "Japan / USA"), ("usa, japan", "USA / Japan"),
    ("europe, australia", "Europe"),
];

pub struct RomScanner {
    media_root: Option<PathBuf>,
    dir_cache: HashMap<PathBuf, DirInfo>,
    pub errors: Vec<String>,
}

#[derive(Default)]
struct DirInfo {
    /// Lowercase file names referenced by .cue / .m3u / .gdi sheets in this folder.
    referenced: HashSet<String>,
    /// Lowercase file names present in this folder.
    files: HashSet<String>,
}

impl RomScanner {
    pub fn new(media_root: Option<PathBuf>) -> Self {
        let media_root = media_root.or_else(|| {
            let d = dirs::home_dir()?.join("ES-DE/downloaded_media");
            d.is_dir().then_some(d)
        });
        Self { media_root, dir_cache: HashMap::new(), errors: vec![] }
    }

    pub fn scan(&mut self, dirs: &[ScanDir], mut progress: impl FnMut(usize, &str)) -> Vec<ScannedGame> {
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        for d in dirs.iter().filter(|d| d.enabled) {
            let root = PathBuf::from(&d.path);
            if !root.is_dir() {
                self.errors.push(format!("Directory not found: {}", d.path));
                continue;
            }
            let forced = d.platform.as_deref().and_then(platforms::get);
            self.scan_root(&root, forced, &mut out, &mut seen, &mut progress);
        }
        out
    }

    fn scan_root(
        &mut self,
        root: &Path,
        forced: Option<&'static Platform>,
        out: &mut Vec<ScannedGame>,
        seen: &mut HashSet<String>,
        progress: &mut impl FnMut(usize, &str),
    ) {
        let mut it = WalkDir::new(root).follow_links(true).max_depth(10).into_iter();
        while let Some(entry) = it.next() {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    log::debug!("walk error: {e}");
                    continue;
                }
            };
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if entry.file_type().is_dir() {
                if entry.depth() > 0 && (name.starts_with('.') || SKIP_DIRS.contains(&name.to_lowercase().as_str())) {
                    it.skip_current_dir();
                    continue;
                }
                let platform_hint = forced.or_else(|| alias_for(root, path));
                if let Some(g) = self.detect_dir_game(path, platform_hint) {
                    if seen.insert(g.path.clone()) {
                        progress(out.len() + 1, &g.title);
                        out.push(g);
                    }
                    it.skip_current_dir();
                }
                continue;
            }

            let Some(ext) = path.extension().map(|e| e.to_string_lossy().to_lowercase()) else { continue };
            let parent = path.parent().unwrap_or(root).to_path_buf();
            let platform = forced
                .or_else(|| alias_for(root, &parent))
                .or_else(|| platforms::by_extension(&ext));
            let Some(platform) = platform else { continue };
            if matches!(platform.id, "steam" | "pc") || !platforms::accepts_extension(platform, &ext) {
                continue;
            }

            let info = self.dir_info(&parent);
            let lname = name.to_lowercase();
            if info.referenced.contains(&lname) {
                continue; // track file of a cue/m3u/gdi sheet
            }
            if is_secondary_disc(&lname, &info.files) || is_update_or_dlc(&lname, &ext) {
                continue;
            }

            let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            let (title, region, serial) = clean_title(&stem);
            if matches!(platform.id, "switch" | "switch2") && is_switch_non_base_serial(serial.as_deref(), &lname) {
                continue;
            }
            let folder_name = alias_folder_name(root, &parent).unwrap_or_else(|| platform.id.to_string());
            let (cover, hero, logo) = self.find_media(&parent, &stem, &folder_name);

            let g = ScannedGame {
                platform: platform.id.to_string(),
                title,
                path: path.to_string_lossy().to_string(),
                source: "rom".into(),
                region,
                serial,
                cover,
                hero,
                logo,
                file_size: entry.metadata().ok().map(|m| m.len() as i64),
                ..Default::default()
            };
            if seen.insert(g.path.clone()) {
                progress(out.len() + 1, &g.title);
                out.push(g);
            }
        }
    }

    /// Games that are folders rather than single files (PS3, Wii U, Xbox 360, Vita).
    fn detect_dir_game(&self, dir: &Path, hint: Option<&'static Platform>) -> Option<ScannedGame> {
        let dir_name = dir.file_name()?.to_string_lossy().to_string();
        let mk = |platform: &str, title: String, path: PathBuf| ScannedGame {
            platform: platform.into(),
            title,
            path: path.to_string_lossy().to_string(),
            source: "rom".into(),
            ..Default::default()
        };

        // PlayStation 3 – disc dump (PS3_GAME) or PSN/HDD game (USRDIR + PARAM.SFO)
        let ps3_disc = dir.join("PS3_GAME/USRDIR/EBOOT.BIN");
        let ps3_hdd = dir.join("USRDIR/EBOOT.BIN");
        if ps3_disc.is_file() || (ps3_hdd.is_file() && dir.join("PARAM.SFO").is_file()) {
            let base = if ps3_disc.is_file() { dir.join("PS3_GAME") } else { dir.to_path_buf() };
            let sfo = sfo::read(&base.join("PARAM.SFO")).unwrap_or_default();
            let (fallback, region, _) = clean_title(&dir_name);
            let mut g = mk("ps3", sfo.get("TITLE").cloned().map(|t| t.replace('\n', " ")).unwrap_or(fallback), dir.to_path_buf());
            g.region = region;
            g.serial = sfo.get("TITLE_ID").cloned();
            g.cover = existing(&base.join("ICON0.PNG"));
            g.hero = existing(&base.join("PIC1.PNG")).or_else(|| existing(&base.join("PIC0.PNG")));
            return Some(g);
        }

        // Wii U – loadiine / extracted format (code/*.rpx)
        let code = dir.join("code");
        if code.is_dir() && dir.join("meta").is_dir() {
            if let Some(rpx) = std::fs::read_dir(&code).ok()?.flatten().map(|e| e.path()).find(|p| {
                p.extension().map(|e| e.eq_ignore_ascii_case("rpx")).unwrap_or(false)
            }) {
                let meta = std::fs::read_to_string(dir.join("meta/meta.xml")).unwrap_or_default();
                let (fallback, region, _) = clean_title(&dir_name);
                let title = xml_tag(&meta, "longname_en").map(|t| t.replace('\n', " ")).unwrap_or(fallback);
                let mut g = mk("wiiu", title, rpx);
                g.region = region;
                g.serial = xml_tag(&meta, "title_id");
                return Some(g);
            }
        }

        // Xbox 360 – extracted game with default.xex
        let xex = dir.join("default.xex");
        if xex.is_file() {
            let (title, region, _) = clean_title(&dir_name);
            let mut g = mk("xbox360", title, xex);
            g.region = region;
            return Some(g);
        }

        // PS Vita – decrypted folder (sce_sys/param.sfo + eboot.bin)
        let vita_sfo = dir.join("sce_sys/param.sfo");
        if vita_sfo.is_file() && dir.join("eboot.bin").is_file() {
            let sfo = sfo::read(&vita_sfo).unwrap_or_default();
            let mut g = mk("psvita", sfo.get("TITLE").cloned().unwrap_or(dir_name.clone()), dir.to_path_buf());
            g.serial = sfo.get("TITLE_ID").cloned();
            g.cover = existing(&dir.join("sce_sys/icon0.png"));
            g.hero = existing(&dir.join("sce_sys/pic0.png"));
            return Some(g);
        }

        let _ = hint;
        None
    }

    fn dir_info(&mut self, dir: &Path) -> &DirInfo {
        self.dir_cache.entry(dir.to_path_buf()).or_insert_with(|| {
            let mut info = DirInfo::default();
            let Ok(rd) = std::fs::read_dir(dir) else { return info };
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                let lower = name.to_lowercase();
                if lower.ends_with(".cue") || lower.ends_with(".m3u") || lower.ends_with(".gdi") {
                    if let Ok(text) = std::fs::read_to_string(e.path()) {
                        for r in sheet_references(&lower, &text) {
                            info.referenced.insert(r.to_lowercase());
                        }
                    }
                }
                info.files.insert(lower);
            }
            info
        })
    }

    fn find_media(&self, dir: &Path, stem: &str, system_folder: &str) -> (Option<String>, Option<String>, Option<String>) {
        let lookup = |base: &Path, names: &[String]| -> Option<String> {
            for n in names {
                for ext in IMAGE_EXTS {
                    let p = base.join(format!("{n}.{ext}"));
                    if p.is_file() {
                        return Some(p.to_string_lossy().to_string());
                    }
                }
            }
            None
        };
        let names = [stem.to_string(), format!("{stem}-image"), format!("{stem}-thumb")];
        let mut cover = lookup(dir, &names[..1]);
        for sub in ["media/covers", "media/boxart", "media/box2dfront", "covers", "boxart", "images", "media/images"] {
            if cover.is_some() {
                break;
            }
            cover = lookup(&dir.join(sub), &names);
        }
        let mut hero = lookup(&dir.join("media/fanart"), &names[..1])
            .or_else(|| lookup(&dir.join("media/screenshots"), &names[..1]));
        let mut logo = lookup(&dir.join("media/marquees"), &names[..1]);

        if let Some(media) = &self.media_root {
            let sys = media.join(system_folder);
            let one = [stem.to_string()];
            cover = cover.or_else(|| lookup(&sys.join("covers"), &one));
            hero = hero.or_else(|| lookup(&sys.join("fanart"), &one)).or_else(|| lookup(&sys.join("screenshots"), &one));
            logo = logo.or_else(|| lookup(&sys.join("marquees"), &one));
        }
        (cover, hero, logo)
    }
}

fn existing(p: &Path) -> Option<String> {
    p.is_file().then(|| p.to_string_lossy().to_string())
}

/// Nearest folder (from `dir` up to and including `root`) whose name is a platform alias.
fn alias_for(root: &Path, dir: &Path) -> Option<&'static Platform> {
    let mut cur = Some(dir);
    while let Some(d) = cur {
        if let Some(p) = d.file_name().and_then(|n| platforms::by_alias(&n.to_string_lossy())) {
            return Some(p);
        }
        if d == root {
            break;
        }
        cur = d.parent();
    }
    None
}

fn alias_folder_name(root: &Path, dir: &Path) -> Option<String> {
    let mut cur = Some(dir);
    while let Some(d) = cur {
        let name = d.file_name()?.to_string_lossy().to_string();
        if platforms::by_alias(&name).is_some() {
            return Some(name);
        }
        if d == root {
            break;
        }
        cur = d.parent();
    }
    None
}

/// Files referenced by a cue sheet, m3u playlist or gdi descriptor.
fn sheet_references(sheet_name: &str, text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in text.lines() {
        let l = line.trim();
        if sheet_name.ends_with(".cue") {
            if l.to_uppercase().starts_with("FILE") {
                if let (Some(a), Some(b)) = (l.find('"'), l.rfind('"')) {
                    if b > a {
                        out.push(l[a + 1..b].to_string());
                    }
                }
            }
        } else if sheet_name.ends_with(".m3u") {
            if !l.is_empty() && !l.starts_with('#') {
                out.push(Path::new(l).file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default());
            }
        } else if sheet_name.ends_with(".gdi") {
            // "1 0 4 2352 track01.bin 0" or quoted names
            if let (Some(a), Some(b)) = (l.find('"'), l.rfind('"')) {
                if b > a {
                    out.push(l[a + 1..b].to_string());
                    continue;
                }
            }
            let parts: Vec<&str> = l.split_whitespace().collect();
            if parts.len() >= 6 {
                out.push(parts[4].to_string());
            }
        }
    }
    out
}

/// Skip "(Disc 2)" etc. when the first disc or a playlist is present in the same folder.
fn is_secondary_disc(lname: &str, siblings: &HashSet<String>) -> bool {
    for marker in ["(disc ", "(disk ", "(cd"] {
        if let Some(pos) = lname.find(marker) {
            let after = &lname[pos + marker.len()..];
            let num: String = after.trim_start().chars().take_while(|c| c.is_ascii_digit()).collect();
            if num.is_empty() || num == "1" {
                return false;
            }
            let first = format!("{}{}1{}", &lname[..pos], marker, &after[num.len()..]);
            let has_m3u = siblings.iter().any(|s| s.ends_with(".m3u"));
            return siblings.contains(&first) || has_m3u;
        }
    }
    false
}

pub fn is_update_or_dlc(lname: &str, ext: &str) -> bool {
    if ["[upd", "[dlc", "(update", "(dlc", "[update", "[patch", "(patch", " update ", "_update", "-update"]
        .iter()
        .any(|m| lname.contains(m))
    {
        return true;
    }
    // Nintendo Switch NSP/NSZ/XCI/XCZ update & DLC naming patterns:
    // - Title IDs ending in 800 (updates) or not ending in 000 (DLCs)
    // - Version tags "[v65536]", "(v131072)", "v1.2.0" when combined with update markers or non-000 versions
    if matches!(ext, "nsp" | "nsz" | "xci" | "xcz") {
        // Check any 16-hex-char Switch TitleID inside the filename
        let bytes = lname.as_bytes();
        if bytes.len() >= 16 {
            for w in bytes.windows(16) {
                if w.iter().all(|b| b.is_ascii_hexdigit()) {
                    // Base games always end with "000"; updates end with "800"; DLCs end with other hex digits.
                    if &w[13..16] != b"000" {
                        return true;
                    }
                }
            }
        }
        // Check "[v12345]" or "(v12345)" version tags: base dumps are [v0], updates are [v65536]+
        for (open, close) in [("[v", ']'), ("(v", ')')] {
            let mut rest = lname;
            while let Some(pos) = rest.find(open) {
                let after = &rest[pos + open.len()..];
                if let Some(end) = after.find(close) {
                    let ver = &after[..end];
                    if !ver.is_empty() && ver.chars().all(|c| c.is_ascii_digit()) && ver != "0" {
                        return true;
                    }
                }
                rest = after;
            }
        }
    }
    false
}

fn is_switch_non_base_serial(serial: Option<&str>, lname: &str) -> bool {
    if let Some(s) = serial {
        if s.len() == 16 && s.chars().all(|c| c.is_ascii_hexdigit()) && !s.ends_with("000") {
            return true;
        }
    }
    let _ = lname;
    false
}

/// Turn a No-Intro / Redump style filename into (title, region, serial).
pub fn clean_title(stem: &str) -> (String, Option<String>, Option<String>) {
    let mut region = None;
    let mut serial = None;
    let mut cut = stem.len();
    let bytes: Vec<char> = stem.chars().collect();
    let mut i = 0;
    let mut char_idx_to_byte = Vec::with_capacity(bytes.len() + 1);
    {
        let mut b = 0;
        for c in &bytes {
            char_idx_to_byte.push(b);
            b += c.len_utf8();
        }
        char_idx_to_byte.push(b);
    }
    while i < bytes.len() {
        let c = bytes[i];
        if c == '(' || c == '[' {
            let close = if c == '(' { ')' } else { ']' };
            if let Some(j) = bytes[i + 1..].iter().position(|x| *x == close) {
                let tag: String = bytes[i + 1..i + 1 + j].iter().collect();
                let t = tag.trim().to_lowercase();
                if region.is_none() {
                    if let Some((_, r)) = REGIONS.iter().find(|(k, _)| *k == t) {
                        region = Some(r.to_string());
                    }
                }
                if serial.is_none() && tag.len() == 16 && tag.chars().all(|x| x.is_ascii_hexdigit()) {
                    serial = Some(tag.to_uppercase());
                }
                if serial.is_none() && looks_like_serial(&tag) {
                    serial = Some(tag.to_uppercase());
                }
                cut = cut.min(char_idx_to_byte[i]);
                i += j + 2;
                continue;
            }
        }
        i += 1;
    }
    let mut title = stem[..cut].replace('_', " ").trim().trim_end_matches(['-', '.', ' ']).to_string();
    // "Legend of Zelda, The - Subtitle" → "The Legend of Zelda - Subtitle"
    for article in [", The", ", A", ", An", ", Le", ", La", ", Les", ", Die", ", Der"] {
        let art = &article[2..];
        if let Some(pos) = title.find(&format!("{article} - ")) {
            title = format!("{art} {}{}", &title[..pos], &title[pos + article.len()..]);
            break;
        } else if title.ends_with(article) {
            title = format!("{art} {}", &title[..title.len() - article.len()]);
            break;
        }
    }
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    (if title.is_empty() { stem.to_string() } else { title }, region, serial)
}

/// PlayStation-style serials such as SLUS-00594 or BLES01807.
fn looks_like_serial(tag: &str) -> bool {
    let t: String = tag.chars().filter(|c| *c != '-' && *c != '_').collect();
    t.len() == 9 && t[..4].chars().all(|c| c.is_ascii_uppercase()) && t[4..].chars().all(|c| c.is_ascii_digit())
}

fn xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}");
    let start = xml.find(&open)?;
    let gt = xml[start..].find('>')? + start + 1;
    let end = xml[gt..].find(&format!("</{tag}>"))? + gt;
    let v = xml[gt..end].trim().to_string();
    (!v.is_empty()).then_some(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_no_intro_names() {
        let (t, r, _) = clean_title("Legend of Zelda, The - A Link to the Past (USA)");
        assert_eq!(t, "The Legend of Zelda - A Link to the Past");
        assert_eq!(r.as_deref(), Some("USA"));
        let (t, r, _) = clean_title("Super_Mario_World (Europe) [!]");
        assert_eq!(t, "Super Mario World");
        assert_eq!(r.as_deref(), Some("Europe"));
        let (t, _, s) = clean_title("Zelda TOTK [0100F2C0115B6000][v0]");
        assert_eq!(t, "Zelda TOTK");
        assert_eq!(s.as_deref(), Some("0100F2C0115B6000"));
    }

    #[test]
    fn secondary_discs() {
        let mut s = HashSet::new();
        s.insert("ff7 (usa) (disc 1).chd".to_string());
        assert!(is_secondary_disc("ff7 (usa) (disc 2).chd", &s));
        assert!(!is_secondary_disc("ff7 (usa) (disc 1).chd", &s));
    }

    #[test]
    fn filters_switch_updates_and_dlcs() {
        assert!(!is_update_or_dlc("zelda totk [0100f2c0115b6000][v0].nsp", "nsp"));
        assert!(is_update_or_dlc("zelda totk [0100f2c0115b6800][v65536].nsp", "nsp"));
        assert!(is_update_or_dlc("zelda totk [0100f2c0115b6001][v0].nsp", "nsp"));
        assert!(is_update_or_dlc("mario kart 8 deluxe [v131072].nsp", "nsp"));
        assert!(is_update_or_dlc("super smash bros_update_13.0.2.nsp", "nsp"));
    }
}
