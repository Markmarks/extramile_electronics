// ESC/POS receipt + label printing (docs/07-DESKTOP-ADMIN.md §6).
// The ESC/POS byte stream is built here in pure Rust (80mm, code page 437). Jobs are
// written to a spool file under the app data dir and the path is returned; a failed
// print never changes order state. To drive a physical printer, swap `spool()` for a
// raw spooler send (e.g. the `printers` crate on Windows) — the byte stream is unchanged.
use serde::Deserialize;
use std::io::Write;
use tauri::{AppHandle, Manager};

// ── ESC/POS builder ──────────────────────────────────────────────────────────
struct EscPos {
    buf: Vec<u8>,
}
impl EscPos {
    fn new() -> Self {
        let mut b = EscPos { buf: Vec::new() };
        b.buf.extend_from_slice(&[0x1B, 0x40]); // ESC @ — init
        b
    }
    fn align(&mut self, mode: u8) -> &mut Self {
        self.buf.extend_from_slice(&[0x1B, 0x61, mode]); // 0 left, 1 center, 2 right
        self
    }
    fn bold(&mut self, on: bool) -> &mut Self {
        self.buf.extend_from_slice(&[0x1B, 0x45, on as u8]);
        self
    }
    fn line(&mut self, text: &str) -> &mut Self {
        self.buf.extend_from_slice(text.as_bytes());
        self.buf.push(0x0A);
        self
    }
    fn feed(&mut self, n: u8) -> &mut Self {
        self.buf.extend_from_slice(&[0x1B, 0x64, n]); // ESC d n
        self
    }
    /// Code128 barcode (GS k 73), data in code set B.
    fn code128(&mut self, data: &str) -> &mut Self {
        self.buf.extend_from_slice(&[0x1D, 0x68, 80]); // GS h — height
        self.buf.extend_from_slice(&[0x1D, 0x77, 2]); // GS w — width
        let payload: Vec<u8> = {
            let mut v = vec![0x7B, 0x42]; // {B code set
            v.extend_from_slice(data.as_bytes());
            v
        };
        self.buf.extend_from_slice(&[0x1D, 0x6B, 73, payload.len() as u8]);
        self.buf.extend_from_slice(&payload);
        self.buf.push(0x0A);
        self
    }
    fn cut(&mut self) -> &mut Self {
        self.buf.extend_from_slice(&[0x1D, 0x56, 0x01]); // GS V 1 — partial cut
        self
    }
    fn done(self) -> Vec<u8> {
        self.buf
    }
}

fn spool(app: &AppHandle, name: &str, bytes: &[u8]) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("prints");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{name}.escpos.bin"));
    let mut f = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
#[derive(Deserialize)]
pub struct ReceiptLine {
    name: String,
    qty: i64,
    line_total: String,
}
#[derive(Deserialize)]
pub struct ReceiptDto {
    header: String,
    order_number: String,
    lines: Vec<ReceiptLine>,
    total: String,
    paystack_ref: Option<String>,
    warranty: Option<String>,
}

// ── commands ─────────────────────────────────────────────────────────────────
#[tauri::command]
pub fn list_printers() -> Vec<String> {
    // Device enumeration is OS-specific; the counter PC's printer is chosen in Settings.
    // Swap for `printers::get_printers()` when wiring the physical spooler.
    vec!["Spool file (default)".to_string()]
}

#[tauri::command]
pub fn print_receipt(app: AppHandle, dto: ReceiptDto, _printer: String) -> Result<String, String> {
    let mut b = EscPos::new();
    b.align(1).bold(true).line(&dto.header).bold(false);
    b.line(&format!("Order {}", dto.order_number)).feed(1).align(0);
    for l in &dto.lines {
        b.line(&format!("{} x{}  {}", l.name, l.qty, l.line_total));
    }
    b.feed(1).align(2).bold(true).line(&format!("TOTAL  {}", dto.total)).bold(false);
    if let Some(r) = &dto.paystack_ref {
        b.align(0).line(&format!("Paystack ref: {r}"));
    }
    if let Some(w) = &dto.warranty {
        b.line(w);
    }
    b.feed(1).align(1).code128(&dto.order_number).feed(2).cut();
    spool(&app, &dto.order_number, &b.done())
}

#[tauri::command]
pub fn print_label(
    app: AppHandle,
    sku: String,
    name: String,
    price_pesewas: i64,
    copies: u8,
    _printer: String,
) -> Result<String, String> {
    let mut b = EscPos::new();
    let price = format!("GH\u{20B5} {}.{:02}", price_pesewas / 100, price_pesewas % 100);
    for _ in 0..copies.max(1) {
        b.align(1).bold(true).line(&name).bold(false).line(&price).code128(&sku).feed(1);
    }
    b.cut();
    spool(&app, &format!("label-{sku}"), &b.done())
}

#[tauri::command]
pub fn print_test(app: AppHandle, _printer: String) -> Result<String, String> {
    let mut b = EscPos::new();
    b.align(1).bold(true).line("ExtraMile — printer test").bold(false);
    b.line("80mm ESC/POS OK").code128("TEST123").feed(2).cut();
    spool(&app, "printer-test", &b.done())
}
