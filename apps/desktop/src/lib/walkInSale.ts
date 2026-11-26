// Walk-in sale shapes and pure helpers (no network), unit-tested in CI without env.

export type PayMethod = 'cash' | 'momo';

export interface SaleLine {
  variantId: string;
  sku: string;
  title: string;
  /** Shelf price at the time of the sale, for the on-screen total only (pesewas). */
  price: number;
  qty: number;
  serials: string[];
}

export interface SaleInput {
  lines: SaleLine[];
  method: PayMethod;
  customer: string;
  phone: string;
  email: string;
}

export type SaleResult =
  | { kind: 'recorded'; orderId: string; orderNumber: string; total: number }
  | { kind: 'queued'; localRef: string };

export function saleTotal(lines: SaleLine[]): number {
  return lines.reduce((n, l) => n + l.price * l.qty, 0);
}

/** One IMEI/serial per unit at most; blanks dropped, duplicates removed. */
export function cleanSerials(raw: string, qty: number): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, qty);
}

export function salePayload(input: SaleInput, localRef: string): Record<string, unknown> {
  return {
    items: input.lines.map((l) => ({ variant_id: l.variantId, qty: l.qty, serials: l.serials })),
    method: input.method,
    customer: input.customer.trim() || null,
    phone: input.phone.trim() || null,
    email: input.email.trim() || null,
    local_ref: localRef,
  };
}
