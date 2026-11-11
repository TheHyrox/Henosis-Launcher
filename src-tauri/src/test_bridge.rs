//! Test bridge HTTP server on 127.0.0.1:9998
//! Allows external MCP servers, testing harnesses, and Wayland automation to interact
//! with the running Nexus Launcher window, send inputs, query state, and capture screenshots.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use parking_lot::Mutex;
use tauri::{AppHandle, Manager};

static BRIDGE_RUNNING: AtomicBool = AtomicBool::new(false);
static LATEST_STATE: Mutex<serde_json::Value> = Mutex::new(serde_json::Value::Null);

pub fn set_latest_state(state: serde_json::Value) {
    *LATEST_STATE.lock() = state;
}

pub fn start(app: AppHandle) {
    if BRIDGE_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    thread::spawn(move || {
        let addr = "127.0.0.1:9998";
        let listener = match TcpListener::bind(addr) {
            Ok(l) => {
                log::info!("Test bridge listening on http://{}", addr);
                l
            }
            Err(e) => {
                log::warn!("Could not bind test bridge on {}: {}", addr, e);
                return;
            }
        };

        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let app_clone = app.clone();
                    thread::spawn(move || {
                        handle_connection(stream, app_clone);
                    });
                }
                Err(e) => {
                    log::warn!("Test bridge connection error: {}", e);
                }
            }
        }
    });
}

fn handle_connection(mut stream: TcpStream, app: AppHandle) {
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
    let mut reader = BufReader::new(&stream);

    let mut line = String::new();
    if reader.read_line(&mut line).unwrap_or(0) == 0 {
        return;
    }

    let parts: Vec<String> = line.split_whitespace().map(|s| s.to_string()).collect();
    if parts.len() < 2 {
        return;
    }

    let method = parts[0].clone();
    let path = parts[1].clone();

    let mut content_length = 0;
    loop {
        line.clear();
        if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        let lower = line.to_lowercase();
        if lower.starts_with("content-length:") {
            if let Some(val) = line.split(':').nth(1) {
                content_length = val.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }

    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        let _ = reader.read_exact(&mut body);
    }
    let body_str = String::from_utf8_lossy(&body);

    let (status, content_type, response_body) = match (method.as_str(), path.as_str()) {
        ("OPTIONS", _) => ("204 No Content", "text/plain", "".to_string()),
        ("GET", "/health") | ("GET", "/status") => (
            "200 OK",
            "application/json",
            serde_json::json!({
                "ok": true,
                "name": "henosis-launcher",
                "version": "0.1.0",
                "environment": "wayland"
            })
            .to_string(),
        ),
        ("POST", "/report_state") => {
            let json: serde_json::Value = serde_json::from_str(&body_str).unwrap_or_default();
            *LATEST_STATE.lock() = json;
            (
                "200 OK",
                "application/json",
                serde_json::json!({ "ok": true }).to_string(),
            )
        }
        ("GET", "/state") => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval("if (window.__NEXUS_REPORT) { window.__NEXUS_REPORT(); }");
                thread::sleep(Duration::from_millis(50));
            }
            let state = LATEST_STATE.lock().clone();
            (
                "200 OK",
                "application/json",
                serde_json::json!({ "ok": true, "state": state }).to_string(),
            )
        }
        ("POST", "/eval") => {
            let json: serde_json::Value = serde_json::from_str(&body_str).unwrap_or_default();
            let script = json["script"].as_str().unwrap_or("");
            if let Some(win) = app.get_webview_window("main") {
                match win.eval(script) {
                    Ok(_) => (
                        "200 OK",
                        "application/json",
                        serde_json::json!({ "ok": true }).to_string(),
                    ),
                    Err(e) => (
                        "500 Internal Error",
                        "application/json",
                        serde_json::json!({ "ok": false, "error": e.to_string() }).to_string(),
                    ),
                }
            } else {
                (
                    "503 Service Unavailable",
                    "application/json",
                    serde_json::json!({ "ok": false, "error": "Main window not found" }).to_string(),
                )
            }
        }
        ("POST", "/input") => {
            let json: serde_json::Value = serde_json::from_str(&body_str).unwrap_or_default();
            let button = json["button"].as_str().unwrap_or("a");
            let js = format!("if (window.__NEXUS_DISPATCH_PAD) {{ window.__NEXUS_DISPATCH_PAD('{}', false); }}", button);
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval(&js);
                (
                    "200 OK",
                    "application/json",
                    serde_json::json!({ "ok": true, "dispatched": button }).to_string(),
                )
            } else {
                (
                    "503 Service Unavailable",
                    "application/json",
                    serde_json::json!({ "ok": false, "error": "Main window not found" }).to_string(),
                )
            }
        }
        ("POST", "/navigate") => {
            let json: serde_json::Value = serde_json::from_str(&body_str).unwrap_or_default();
            let screen_arg = json["screen"].to_string();
            let js = format!("if (window.__NEXUS_STORE) {{ window.__NEXUS_STORE.getState().navigate({}); }}", screen_arg);
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval(&js);
                (
                    "200 OK",
                    "application/json",
                    serde_json::json!({ "ok": true }).to_string(),
                )
            } else {
                (
                    "503 Service Unavailable",
                    "application/json",
                    serde_json::json!({ "ok": false, "error": "Main window not found" }).to_string(),
                )
            }
        }
        ("POST", "/screenshot") => {
            let json: serde_json::Value = serde_json::from_str(&body_str).unwrap_or_default();
            let target_path = json["path"]
                .as_str()
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("/tmp/nexus_screenshot.png"));

            let res = Command::new("spectacle")
                .arg("-b")
                .arg("-n")
                .arg("-o")
                .arg(&target_path)
                .status();

            match res {
                Ok(s) if s.success() => (
                    "200 OK",
                    "application/json",
                    serde_json::json!({ "ok": true, "path": target_path.to_string_lossy() })
                        .to_string(),
                ),
                Ok(s) => (
                    "500 Internal Error",
                    "application/json",
                    serde_json::json!({ "ok": false, "exit_code": s.code() }).to_string(),
                ),
                Err(e) => (
                    "500 Internal Error",
                    "application/json",
                    serde_json::json!({ "ok": false, "error": e.to_string() }).to_string(),
                ),
            }
        }
        _ => (
            "404 Not Found",
            "application/json",
            serde_json::json!({ "error": "Not Found" }).to_string(),
        ),
    };

    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n{}",
        status,
        content_type,
        response_body.len(),
        response_body
    );

    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}
