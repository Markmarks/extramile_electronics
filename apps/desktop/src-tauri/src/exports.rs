// Report / CSV exports to local disk (docs/07-DESKTOP-ADMIN.md §6 `write_export`).
//
// The webview chooses only a base name and the contents — never a directory. Files land
// in Documents\ExtraMile Exports; the name is reduced to [A-Za-z0-9_-] and the extension
// comes from a fixed allowlist, so a hostile script can't write anywhere else or drop an
// executable.
use std::io::Write;
use tauri::{AppHandle, Manager};

const ALLOWED_EXT: [&str; 2] = ["csv", "txt"];
const MAX_BYTES: usize = 20 * 1024 * 1024;

pub(crate) fn export_file_name(name: &str, ext: &str) -> Result<String, String> {
    let ext = ext.to_ascii_lowercase();
    if !ALLOWED_EXT.contains(&ext.as_str()) {
        return Err(format!("exports can only be {}", ALLOWED_EXT.join(" or ")));
    }
    let base: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .take(80)
        .collect();
    let base = if base.trim_matches('_').is_empty() { "export".to_string() } else { base };
    Ok(format!("{base}.{ext}"))
}

#[tauri::command]
pub fn write_export(
    app: AppHandle,
    name: String,
    ext: String,
    contents: String,
) -> Result<String, String> {
    if contents.len() > MAX_BYTES {
        return Err("export is too large (20 MB max)".to_string());
    }
    let file = export_file_name(&name, &ext)?;
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("ExtraMile Exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(file);
    let mut f = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    // UTF-8 BOM so Excel opens GH₵ and accented names correctly.
    f.write_all(b"\xEF\xBB\xBF").map_err(|e| e.to_string())?;
    f.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_cannot_escape_the_exports_dir_or_change_type() {
        assert_eq!(export_file_name("../../x", "csv").unwrap(), "______x.csv");
        assert_eq!(export_file_name("C:\\Windows\\a", "csv").unwrap(), "C__Windows_a.csv");
        assert_eq!(export_file_name("", "csv").unwrap(), "export.csv");
        assert_eq!(export_file_name("sales-2026-11", "CSV").unwrap(), "sales-2026-11.csv");
        assert!(export_file_name("x", "exe").is_err());
        assert!(export_file_name("x", "csv.exe").is_err());
        assert!(export_file_name("x", "").is_err());
    }
}
