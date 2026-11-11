//! Parser for Sony's PARAM.SFO metadata files (PS3 / PS Vita / PSP).

use std::collections::HashMap;
use std::path::Path;

pub fn read(path: &Path) -> Option<HashMap<String, String>> {
    let data = std::fs::read(path).ok()?;
    parse(&data)
}

pub fn parse(data: &[u8]) -> Option<HashMap<String, String>> {
    if data.len() < 20 || &data[0..4] != b"\0PSF" {
        return None;
    }
    let u32_at = |o: usize| -> Option<u32> {
        data.get(o..o + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    };
    let u16_at = |o: usize| -> Option<u16> { data.get(o..o + 2).map(|b| u16::from_le_bytes([b[0], b[1]])) };

    let key_table = u32_at(8)? as usize;
    let data_table = u32_at(12)? as usize;
    let count = u32_at(16)? as usize;
    let mut out = HashMap::new();

    for i in 0..count.min(256) {
        let entry = 20 + i * 16;
        let key_off = u16_at(entry)? as usize;
        let fmt = u16_at(entry + 2)?;
        let len = u32_at(entry + 4)? as usize;
        let data_off = u32_at(entry + 12)? as usize;

        let kstart = key_table + key_off;
        let kend = data[kstart..].iter().position(|b| *b == 0).map(|p| kstart + p)?;
        let key = String::from_utf8_lossy(&data[kstart..kend]).to_string();

        let dstart = data_table + data_off;
        let value = match fmt {
            0x0204 | 0x0004 => {
                let raw = data.get(dstart..dstart + len)?;
                let end = raw.iter().position(|b| *b == 0).unwrap_or(raw.len());
                String::from_utf8_lossy(&raw[..end]).to_string()
            }
            0x0404 => u32_at(dstart).map(|v| v.to_string()).unwrap_or_default(),
            _ => continue,
        };
        out.insert(key, value);
    }
    Some(out)
}
