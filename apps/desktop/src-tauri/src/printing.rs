// ESC/POS receipt, packing slip, warranty card + label printing (docs/07-DESKTOP-ADMIN.md §6).
//
// The ESC/POS byte stream is built here in pure Rust (80mm, code page 437). Every job is
// first written to a spool file under the app data dir (a reprintable copy), then — unless
// the "Spool file" pseudo-printer is chosen in Settings — sent RAW to the Windows printer
// through the print spooler (winspool). A failed print returns a typed error string for
// the toast and never changes order state.
use serde::Deserialize;
use std::io::Write;
use tauri::{AppHandle, Manager};

/// The pseudo-printer that only writes the spool file (also the non-Windows behaviour).
pub const SPOOL_PRINTER: &str = "Spool file (default)";

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
        self.buf.extend_from_slice(printable(text).as_bytes());
        self.buf.push(0x0A);
        self
    }
    /// Several lines from text that may contain '\n'.
    fn lines(&mut self, text: &str) -> &mut Self {
        for l in text.split('\n') {
            self.line(l);
        }
        self
    }
    fn rule(&mut self) -> &mut Self {
        self.line(&"-".repeat(42))
    }
    fn feed(&mut self, n: u8) -> &mut Self {
        self.buf.extend_from_slice(&[0x1B, 0x64, n]); // ESC d n
        self
    }
    /// Code128 barcode (GS k 73), data in code set B (printable ASCII, max 60 chars).
    fn code128(&mut self, data: &str) -> &mut Self {
        let data: String = data
            .chars()
            .filter(|c| c.is_ascii_graphic() || *c == ' ')
            .take(60)
            .collect();
        if data.is_empty() {
            return self;
        }
        self.buf.extend_from_slice(&[0x1D, 0x68, 80]); // GS h — height
        self.buf.extend_from_slice(&[0x1D, 0x77, 2]); // GS w — width
        let mut payload = vec![0x7B, 0x42]; // {B code set
        payload.extend_from_slice(data.as_bytes());
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

/// Thermal printers use code page 437: "GH₵" becomes "GHS", other non-ASCII becomes '?',
/// and control characters are dropped so text can't inject ESC/POS commands.
fn printable(text: &str) -> String {
    text.replace("GH\u{20B5}", "GHS")
        .replace('\u{20B5}', "GHS")
        .replace(['\u{2014}', '\u{2013}'], "-")
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| if c.is_ascii() { c } else { '?' })
        .take(200)
        .collect()
}

/// A file name that can't leave the prints directory: [A-Za-z0-9_-] only, never empty.
fn safe_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .take(64)
        .collect();
    if s.trim_matches('_').is_empty() {
        "job".to_string()
    } else {
        s
    }
}

fn spool(app: &AppHandle, name: &str, bytes: &[u8]) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("prints");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.escpos.bin", safe_name(name)));
    let mut f = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Spool a copy, then send to the chosen printer. Returns where the job went.
fn dispatch(app: &AppHandle, printer: &str, name: &str, bytes: &[u8]) -> Result<String, String> {
    let path = spool(app, name, bytes)?;
    if printer.is_empty() || printer == SPOOL_PRINTER {
        return Ok(format!("saved to {path}"));
    }
    if !installed_printers().iter().any(|p| p == printer) {
        return Err(format!("printer \"{printer}\" not found — choose one in Settings"));
    }
    send_raw(printer, name, bytes)?;
    Ok(format!("sent to {printer}"))
}

// ── Windows spooler (RAW) ───────────────────────────────────────────────────
#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn installed_printers() -> Vec<String> {
    use windows_sys::Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W,
    };
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let (mut needed, mut count) = (0u32, 0u32);
    // SAFETY: first call only asks for the buffer size (null buffer, 0 bytes).
    unsafe {
        EnumPrintersW(flags, std::ptr::null(), 4, std::ptr::null_mut(), 0, &mut needed, &mut count)
    };
    if needed == 0 {
        return Vec::new();
    }
    // u64-backed buffer so the PRINTER_INFO_4W array is suitably aligned.
    let mut buf = vec![0u64; (needed as usize).div_ceil(8)];
    // SAFETY: buf is at least `needed` bytes; the API fills `count` PRINTER_INFO_4W structs
    // whose string pointers point into the same buffer, which outlives the reads below.
    let ok = unsafe {
        EnumPrintersW(
            flags,
            std::ptr::null(),
            4,
            buf.as_mut_ptr() as *mut u8,
            needed,
            &mut needed,
            &mut count,
        )
    };
    if ok == 0 {
        return Vec::new();
    }
    let infos = buf.as_ptr() as *const PRINTER_INFO_4W;
    (0..count as usize)
        .filter_map(|i| {
            // SAFETY: i < count, within the array the API wrote.
            let p = unsafe { (*infos.add(i)).pPrinterName };
            if p.is_null() {
                return None;
            }
            // SAFETY: pPrinterName is a NUL-terminated UTF-16 string inside `buf`.
            let len = (0..).take_while(|&j| unsafe { *p.add(j) } != 0).count();
            let slice = unsafe { std::slice::from_raw_parts(p, len) };
            Some(String::from_utf16_lossy(slice))
        })
        .collect()
}

#[cfg(windows)]
fn send_raw(printer: &str, job: &str, bytes: &[u8]) -> Result<(), String> {
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W,
    };
    let name = wide(printer);
    let mut doc_name = wide(&format!("ExtraMile {}", safe_name(job)));
    let mut datatype = wide("RAW");
    let mut h: HANDLE = std::ptr::null_mut();
    // SAFETY: `name` is NUL-terminated and lives for the call; h receives the handle.
    if unsafe { OpenPrinterW(name.as_ptr(), &mut h, std::ptr::null()) } == 0 || h.is_null() {
        return Err(format!("could not open printer \"{printer}\" (is it switched on?)"));
    }
    let info = DOC_INFO_1W {
        pDocName: doc_name.as_mut_ptr(),
        pOutputFile: std::ptr::null_mut(),
        pDatatype: datatype.as_mut_ptr(),
    };
    // SAFETY: h is an open printer handle; the DOC_INFO_1W strings outlive these calls; the
    // handle is closed on every path below.
    let result = unsafe {
        if StartDocPrinterW(h, 1, &info) == 0 {
            Err("the printer refused the job".to_string())
        } else {
            let mut written = 0u32;
            let ok = StartPagePrinter(h) != 0
                && WritePrinter(h, bytes.as_ptr().cast(), bytes.len() as u32, &mut written) != 0
                && written as usize == bytes.len();
            EndPagePrinter(h);
            EndDocPrinter(h);
            if ok {
                Ok(())
            } else {
                Err("printing failed part-way (out of paper or offline?) — reprint".to_string())
            }
        }
    };
    // SAFETY: h came from OpenPrinterW and is closed exactly once.
    unsafe { ClosePrinter(h) };
    result
}

#[cfg(not(windows))]
fn installed_printers() -> Vec<String> {
    Vec::new()
}

#[cfg(not(windows))]
fn send_raw(_printer: &str, _job: &str, _bytes: &[u8]) -> Result<(), String> {
    Err("direct printing is only available on Windows".to_string())
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
    #[serde(default)]
    sub_header: Option<String>,
    #[serde(default)]
    footer: Option<String>,
    #[serde(default)]
    payment_note: Option<String>,
}

#[derive(Deserialize)]
pub struct SlipLine {
    name: String,
    sku: String,
    qty: i64,
    #[serde(default)]
    serials: Vec<String>,
}
#[derive(Deserialize)]
pub struct SlipDto {
    order_number: String,
    #[serde(default)]
    ship_to: Vec<String>,
    phone: String,
    lines: Vec<SlipLine>,
    #[serde(default)]
    notes: Option<String>,
}

#[derive(Deserialize)]
pub struct WarrantyItem {
    name: String,
    #[serde(default)]
    serials: Vec<String>,
    months: i64,
}
#[derive(Deserialize)]
pub struct WarrantyDto {
    order_number: String,
    purchased: String,
    #[serde(default)]
    customer: Option<String>,
    items: Vec<WarrantyItem>,
    #[serde(default)]
    footer: Option<String>,
}

// ── byte builders (pure, unit-tested) ────────────────────────────────────────
fn receipt_bytes(dto: &ReceiptDto) -> Vec<u8> {
    let mut b = EscPos::new();
    b.align(1).bold(true).line(&dto.header).bold(false);
    if let Some(s) = dto.sub_header.as_deref().filter(|s| !s.trim().is_empty()) {
        b.lines(s);
    }
    b.line(&format!("Order {}", dto.order_number)).feed(1).align(0);
    for l in &dto.lines {
        b.line(&format!("{} x{}  {}", l.name, l.qty, l.line_total));
    }
    b.feed(1).align(2).bold(true).line(&format!("TOTAL  {}", dto.total)).bold(false);
    b.align(0);
    if let Some(n) = dto.payment_note.as_deref().filter(|s| !s.is_empty()) {
        b.line(n);
    }
    if let Some(r) = &dto.paystack_ref {
        b.line(&format!("Paystack ref: {r}"));
    }
    if let Some(w) = dto.warranty.as_deref().filter(|s| !s.is_empty()) {
        b.feed(1).lines(w);
    }
    if let Some(f) = dto.footer.as_deref().filter(|s| !s.trim().is_empty()) {
        b.feed(1).align(1).lines(f);
    }
    b.feed(1).align(1).code128(&dto.order_number).feed(2).cut();
    b.done()
}

fn slip_bytes(dto: &SlipDto) -> Vec<u8> {
    let mut b = EscPos::new();
    b.align(1).bold(true).line("PACKING SLIP").bold(false);
    b.line(&format!("Order {}", dto.order_number)).align(0).rule();
    b.bold(true).line("Deliver to").bold(false);
    for l in &dto.ship_to {
        b.line(l);
    }
    b.line(&format!("Tel {}", dto.phone)).rule();
    for l in &dto.lines {
        b.bold(true).line(&format!("[ ] {} x{}", l.name, l.qty)).bold(false);
        b.line(&format!("    SKU {}", l.sku));
        for s in &l.serials {
            b.line(&format!("    IMEI/SN {s}"));
        }
    }
    if let Some(n) = dto.notes.as_deref().filter(|s| !s.trim().is_empty()) {
        b.rule().line(&format!("Note: {n}"));
    }
    b.rule().line("Packed by: ________  Checked: ________");
    b.feed(1).align(1).code128(&dto.order_number).feed(2).cut();
    b.done()
}

fn warranty_bytes(dto: &WarrantyDto) -> Vec<u8> {
    let mut b = EscPos::new();
    b.align(1).bold(true).line("extramile").line("WARRANTY CARD").bold(false);
    b.line(&format!("Order {}", dto.order_number));
    b.line(&format!("Purchased {}", dto.purchased)).align(0).rule();
    if let Some(c) = dto.customer.as_deref().filter(|s| !s.trim().is_empty()) {
        b.line(&format!("Customer: {c}"));
    }
    for it in &dto.items {
        b.bold(true).line(&it.name).bold(false);
        b.line(&format!("  {}-month warranty from delivery", it.months));
        for s in &it.serials {
            b.line(&format!("  IMEI/SN {s}"));
        }
    }
    b.rule();
    if let Some(f) = dto.footer.as_deref().filter(|s| !s.trim().is_empty()) {
        b.align(1).lines(f);
    }
    b.feed(1).align(1).code128(&dto.order_number).feed(2).cut();
    b.done()
}

fn label_bytes(sku: &str, name: &str, price_pesewas: i64, copies: u8) -> Vec<u8> {
    let mut b = EscPos::new();
    let p = price_pesewas.max(0);
    let price = format!("GHS {}.{:02}", p / 100, p % 100);
    for _ in 0..copies.clamp(1, 20) {
        b.align(1).bold(true).line(name).bold(false).line(&price).code128(sku).feed(1);
    }
    b.cut();
    b.done()
}

// ── commands ─────────────────────────────────────────────────────────────────
#[tauri::command]
pub fn list_printers() -> Vec<String> {
    let mut all = vec![SPOOL_PRINTER.to_string()];
    all.extend(installed_printers());
    all
}

#[tauri::command]
pub fn print_receipt(app: AppHandle, dto: ReceiptDto, printer: String) -> Result<String, String> {
    dispatch(&app, &printer, &dto.order_number, &receipt_bytes(&dto))
}

#[tauri::command]
pub fn print_packing_slip(app: AppHandle, dto: SlipDto, printer: String) -> Result<String, String> {
    let name = format!("slip-{}", dto.order_number);
    dispatch(&app, &printer, &name, &slip_bytes(&dto))
}

#[tauri::command]
pub fn print_warranty_card(
    app: AppHandle,
    dto: WarrantyDto,
    printer: String,
) -> Result<String, String> {
    if dto.items.is_empty() {
        return Err("nothing on this order carries a warranty".to_string());
    }
    let name = format!("warranty-{}", dto.order_number);
    dispatch(&app, &printer, &name, &warranty_bytes(&dto))
}

#[tauri::command]
pub fn print_label(
    app: AppHandle,
    sku: String,
    name: String,
    price_pesewas: i64,
    copies: u8,
    printer: String,
) -> Result<String, String> {
    let job = format!("label-{sku}");
    dispatch(&app, &printer, &job, &label_bytes(&sku, &name, price_pesewas, copies))
}

#[tauri::command]
pub fn print_test(app: AppHandle, printer: String) -> Result<String, String> {
    let mut b = EscPos::new();
    b.align(1).bold(true).line("ExtraMile - printer test").bold(false);
    b.line("80mm ESC/POS OK").code128("TEST123").feed(2).cut();
    dispatch(&app, &printer, "printer-test", &b.done())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spool_names_cannot_escape_the_prints_dir() {
        assert_eq!(safe_name("../../Windows/System32/x"), "______Windows_System32_x");
        assert_eq!(safe_name("..\\..\\evil"), "______evil");
        assert_eq!(safe_name("label-SKU-1"), "label-SKU-1");
        assert_eq!(safe_name(""), "job");
        assert_eq!(safe_name("///"), "job");
        assert!(safe_name(&"a".repeat(500)).len() <= 64);
    }

    #[test]
    fn printable_text_cannot_inject_escpos_commands() {
        let s = printable("Phone\x1B\x40\x1D\x56\x00 GH\u{20B5} 5.00 \u{2014} ok");
        assert!(!s.chars().any(|c| c.is_control()));
        assert!(s.contains("GHS 5.00 - ok"));
    }

    #[test]
    fn receipt_carries_order_total_and_footer() {
        let dto = ReceiptDto {
            header: "extramile".into(),
            order_number: "EL-20261126-ABC123".into(),
            lines: vec![ReceiptLine { name: "Pixel 8".into(), qty: 1, line_total: "GH\u{20B5} 8,999.00".into() }],
            total: "GH\u{20B5} 8,999.00".into(),
            paystack_ref: None,
            warranty: Some("SKU1 12-month warranty".into()),
            sub_header: Some("Accra".into()),
            footer: Some("Thank you".into()),
            payment_note: Some("Paid in store (cash)".into()),
        };
        let text = String::from_utf8_lossy(&receipt_bytes(&dto)).into_owned();
        for want in ["EL-20261126-ABC123", "TOTAL  GHS 8,999.00", "Paid in store (cash)", "Thank you", "12-month warranty"] {
            assert!(text.contains(want), "missing {want}");
        }
    }

    #[test]
    fn slip_and_warranty_list_every_serial() {
        let slip = SlipDto {
            order_number: "EL-1".into(),
            ship_to: vec!["Ama".into(), "Osu, Accra".into()],
            phone: "+233244000000".into(),
            lines: vec![SlipLine { name: "iPhone".into(), sku: "IP15".into(), qty: 2, serials: vec!["111".into(), "222".into()] }],
            notes: None,
        };
        let t = String::from_utf8_lossy(&slip_bytes(&slip)).into_owned();
        assert!(t.contains("IMEI/SN 111") && t.contains("IMEI/SN 222") && t.contains("Osu, Accra"));

        let card = WarrantyDto {
            order_number: "EL-1".into(),
            purchased: "26/11/2026".into(),
            customer: None,
            items: vec![WarrantyItem { name: "iPhone".into(), serials: vec!["111".into()], months: 12 }],
            footer: None,
        };
        let t = String::from_utf8_lossy(&warranty_bytes(&card)).into_owned();
        assert!(t.contains("12-month warranty") && t.contains("IMEI/SN 111"));
    }

    #[test]
    fn label_copies_are_clamped_and_price_is_formatted() {
        let one = label_bytes("SKU1", "Cable", 2_500, 0);
        let many = label_bytes("SKU1", "Cable", 2_500, 255);
        let t = String::from_utf8_lossy(&one).into_owned();
        assert!(t.contains("GHS 25.00"));
        assert_eq!(t.matches("Cable").count(), 1);
        assert_eq!(String::from_utf8_lossy(&many).matches("Cable").count(), 20);
    }

    #[test]
    fn spool_printer_is_always_listed_first() {
        assert_eq!(list_printers()[0], SPOOL_PRINTER);
    }
}
