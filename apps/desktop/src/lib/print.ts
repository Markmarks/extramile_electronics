import { invoke } from '@tauri-apps/api/core';
import { loadSettings, SPOOL_PRINTER } from './settings';
import { isTauri } from './tauri';

// Field names are snake_case to match the Rust serde structs.
export interface ReceiptDto {
  header: string;
  order_number: string;
  lines: { name: string; qty: number; line_total: string }[];
  total: string;
  paystack_ref?: string | null;
  warranty?: string | null;
  /** Extra lines under the header (Settings → receipt header). */
  sub_header?: string | null;
  /** Closing line (Settings → receipt footer). */
  footer?: string | null;
  /** e.g. "Paid: cash" for walk-in sales. */
  payment_note?: string | null;
}

export interface SlipDto {
  order_number: string;
  ship_to: string[];
  phone: string;
  lines: { name: string; sku: string; qty: number; serials: string[] }[];
  notes?: string | null;
}

export interface WarrantyDto {
  order_number: string;
  purchased: string;
  customer?: string | null;
  items: { name: string; serials: string[]; months: number }[];
  footer?: string | null;
}

/** Printers Windows knows about, plus the spool-file fallback (always first). */
export async function listPrinters(): Promise<string[]> {
  if (!isTauri) return [SPOOL_PRINTER];
  return invoke<string[]>('list_printers');
}

/** The printer chosen in Settings. */
export function currentPrinter(): string {
  return loadSettings().printer;
}

/** Receipt with the Settings header/footer applied. Returns where it went. */
export async function printReceipt(dto: ReceiptDto, printer = currentPrinter()): Promise<string> {
  const s = loadSettings();
  return invoke<string>('print_receipt', {
    dto: {
      ...dto,
      sub_header: dto.sub_header ?? (s.receiptHeader || null),
      footer: dto.footer ?? (s.receiptFooter || null),
    },
    printer,
  });
}

export async function printPackingSlip(dto: SlipDto, printer = currentPrinter()): Promise<string> {
  return invoke<string>('print_packing_slip', { dto, printer });
}

export async function printWarrantyCard(
  dto: WarrantyDto,
  printer = currentPrinter(),
): Promise<string> {
  return invoke<string>('print_warranty_card', { dto, printer });
}

export async function printLabel(
  sku: string,
  name: string,
  pricePesewas: number,
  copies: number,
  printer = currentPrinter(),
): Promise<string> {
  return invoke<string>('print_label', { sku, name, pricePesewas, copies, printer });
}

export async function printTest(printer = currentPrinter()): Promise<string> {
  return invoke<string>('print_test', { printer });
}
