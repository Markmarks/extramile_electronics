import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';

// Field names are snake_case to match the Rust serde structs.
export interface ReceiptDto {
  header: string;
  order_number: string;
  lines: { name: string; qty: number; line_total: string }[];
  total: string;
  paystack_ref?: string | null;
  warranty?: string | null;
}

export async function listPrinters(): Promise<string[]> {
  if (!isTauri) return [];
  return invoke<string[]>('list_printers');
}

export async function printReceipt(dto: ReceiptDto, printer: string): Promise<string> {
  return invoke<string>('print_receipt', { dto, printer });
}

export async function printLabel(
  sku: string,
  name: string,
  pricePesewas: number,
  copies: number,
  printer: string,
): Promise<string> {
  return invoke<string>('print_label', { sku, name, pricePesewas, copies, printer });
}

export async function printTest(printer: string): Promise<string> {
  return invoke<string>('print_test', { printer });
}
