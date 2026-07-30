import 'server-only';

import { serverEnv } from '@/lib/env';

const BASE_URL = 'https://api.paystack.co';
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export const PAYSTACK_CHANNELS = ['mobile_money', 'card', 'bank_transfer', 'ussd'] as const;

export class PaystackError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'PaystackError';
  }
}

/** Paystack GHS subunit is the pesewa, so our stored pesewas ARE the amount (U-20). */
export function toPaystackAmount(pesewas: number): number {
  if (!Number.isInteger(pesewas) || pesewas <= 0) {
    throw new PaystackError(`Invalid amount: ${pesewas} (must be positive integer pesewas)`);
  }
  return pesewas;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const key = serverEnv.paystackSecretKey; // never logged
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });

      if (res.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(200 * 2 ** attempt);
        continue;
      }
      const json = (await res.json()) as T & { status?: boolean; message?: string };
      if (!res.ok || json.status === false) {
        throw new PaystackError(json.message ?? `Paystack error ${res.status}`, res.status);
      }
      return json;
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof Error && err.name === 'AbortError';
      if (retryable && attempt < MAX_RETRIES) {
        await sleep(200 * 2 ** attempt);
        continue;
      }
      if (err instanceof PaystackError) throw err;
      if (attempt >= MAX_RETRIES) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new PaystackError(
    lastErr instanceof Error
      ? `Paystack request failed: ${lastErr.message}`
      : 'Paystack request failed',
  );
}

export interface InitializeParams {
  email: string;
  amount: number; // pesewas
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}

export interface InitializeResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export async function initialize(params: InitializeParams): Promise<InitializeResult> {
  const body = {
    email: params.email,
    amount: toPaystackAmount(params.amount),
    currency: 'GHS',
    reference: params.reference,
    callback_url: params.callbackUrl,
    channels: [...PAYSTACK_CHANNELS],
    metadata: params.metadata,
  };
  const res = await request<{ data: InitializeResult }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data;
}

export interface VerifyResult {
  status: string; // 'success' | 'failed' | 'abandoned' | ...
  reference: string;
  amount: number;
  currency: string;
  channel: string | null;
  id: number;
  paid_at: string | null;
}

export async function verify(reference: string): Promise<VerifyResult> {
  const res = await request<{ data: VerifyResult }>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: 'GET' },
  );
  return res.data;
}

export async function refund(params: { reference: string; amount?: number }): Promise<void> {
  await request('/refund', {
    method: 'POST',
    body: JSON.stringify({
      transaction: params.reference,
      ...(params.amount ? { amount: toPaystackAmount(params.amount) } : {}),
    }),
  });
}
