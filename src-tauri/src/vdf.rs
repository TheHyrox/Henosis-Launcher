//! Minimal parser for Valve's text KeyValues (VDF/ACF) format.

use std::collections::HashMap;

#[derive(Debug, Clone)]
pub enum Vdf {
    Str(String),
    Map(HashMap<String, Vdf>),
}

impl Vdf {
    /// Case-insensitive child lookup.
    pub fn get(&self, key: &str) -> Option<&Vdf> {
        match self {
            Vdf::Map(m) => m
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(key))
                .map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn str(&self, key: &str) -> Option<&str> {
        match self.get(key) {
            Some(Vdf::Str(s)) => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn entries(&self) -> Vec<(&String, &Vdf)> {
        match self {
            Vdf::Map(m) => m.iter().collect(),
            _ => vec![],
        }
    }
}

pub fn parse(input: &str) -> Vdf {
    let tokens = tokenize(input);
    let mut pos = 0;
    Vdf::Map(parse_map(&tokens, &mut pos))
}

#[derive(Debug)]
enum Tok {
    Str(String),
    Open,
    Close,
}

fn tokenize(input: &str) -> Vec<Tok> {
    let mut out = Vec::new();
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                let mut s = String::new();
                while let Some(c) = chars.next() {
                    match c {
                        '\\' => match chars.next() {
                            Some('n') => s.push('\n'),
                            Some('t') => s.push('\t'),
                            Some(o) => s.push(o),
                            None => break,
                        },
                        '"' => break,
                        o => s.push(o),
                    }
                }
                out.push(Tok::Str(s));
            }
            '{' => out.push(Tok::Open),
            '}' => out.push(Tok::Close),
            '/' if chars.peek() == Some(&'/') => {
                for c in chars.by_ref() {
                    if c == '\n' {
                        break;
                    }
                }
            }
            c if c.is_whitespace() => {}
            c => {
                // Unquoted token
                let mut s = String::from(c);
                while let Some(&n) = chars.peek() {
                    if n.is_whitespace() || n == '{' || n == '}' || n == '"' {
                        break;
                    }
                    s.push(n);
                    chars.next();
                }
                out.push(Tok::Str(s));
            }
        }
    }
    out
}

fn parse_map(tokens: &[Tok], pos: &mut usize) -> HashMap<String, Vdf> {
    let mut map = HashMap::new();
    while *pos < tokens.len() {
        match &tokens[*pos] {
            Tok::Close => {
                *pos += 1;
                return map;
            }
            Tok::Str(key) => {
                *pos += 1;
                match tokens.get(*pos) {
                    Some(Tok::Open) => {
                        *pos += 1;
                        let child = parse_map(tokens, pos);
                        map.insert(key.clone(), Vdf::Map(child));
                    }
                    Some(Tok::Str(v)) => {
                        *pos += 1;
                        map.insert(key.clone(), Vdf::Str(v.clone()));
                    }
                    _ => {}
                }
            }
            Tok::Open => *pos += 1,
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_nested() {
        let v = parse(r#""AppState" { "appid" "620" "name" "Portal 2" "UserConfig" { "language" "english" } }"#);
        let app = v.get("appstate").unwrap();
        assert_eq!(app.str("appid"), Some("620"));
        assert_eq!(app.str("name"), Some("Portal 2"));
        assert_eq!(app.get("UserConfig").unwrap().str("language"), Some("english"));
    }
}
