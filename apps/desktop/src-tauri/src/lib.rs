// Rust command surface (docs/07-DESKTOP-ADMIN.md §6, §8).
// Only SUPABASE_URL + anon key are compiled into the webview; no privileged secret
// is ever present in this binary (test D-01).
use keyring::{Entry, Error as KeyringError};
use std::io::{Read, Write};
use std::net::TcpListener;
use uuid::Uuid;

const SERVICE: &str = "com.extramile.admin";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

// ── auth / secrets (Windows Credential Manager) ──────────────────────────────
#[tauri::command]
fn secure_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn secure_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secure_clear(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Stable per-device id, generated once and persisted in the keychain.
#[tauri::command]
fn device_id() -> Result<String, String> {
    let e = entry("device_id")?;
    match e.get_password() {
        Ok(v) => Ok(v),
        Err(KeyringError::NoEntry) => {
            let id = Uuid::new_v4().to_string();
            e.set_password(&id).map_err(|err| err.to_string())?;
            Ok(id)
        }
        Err(err) => Err(err.to_string()),
    }
}

// ── external browser + loopback OAuth (docs/07 §8) ───────────────────────────
#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// One-shot loopback listener on 127.0.0.1:1421. Returns the `code` query param
/// from Supabase's redirect. The PKCE verifier stays in the webview.
#[tauri::command]
async fn oauth_listen() -> Result<String, String> {
    let handle = tauri::async_runtime::spawn_blocking(|| -> Result<String, String> {
        let listener = TcpListener::bind("127.0.0.1:1421").map_err(|e| e.to_string())?;
        let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;

        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
        let request = String::from_utf8_lossy(&buf[..n]);
        let request_line = request.lines().next().unwrap_or("");

        let code = request_line
            .split_whitespace()
            .nth(1) // the path, e.g. /callback?code=XYZ
            .and_then(|path| path.split('?').nth(1))
            .and_then(|query| query.split('&').find(|kv| kv.starts_with("code=")))
            .map(|kv| kv.trim_start_matches("code=").to_string());

        let body = "<html><body>Signed in. You can return to ExtraMile Back-office.</body></html>";
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(response.as_bytes());

        code.ok_or_else(|| "no authorization code in callback".to_string())
    });

    handle.await.map_err(|e| e.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            secure_set,
            secure_get,
            secure_clear,
            device_id,
            open_external,
            oauth_listen
        ])
        .run(tauri::generate_context!())
        .expect("error while running the ExtraMile back-office");
}
