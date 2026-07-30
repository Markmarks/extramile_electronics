import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function isSuppressed(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('email_suppressions')
    .select('email')
    .eq('email', email.toLowerCase())
    .limit(1)
    .returns<{ email: string }[]>();
  return Boolean(data?.[0]);
}

export type SendResult = 'sent' | 'suppressed' | 'skipped';

/** Send via the Resend REST API. No-ops (skipped) when unconfigured (local dev). */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return 'skipped';
  if (await isSuppressed(opts.to)) return 'suppressed';

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}`);
  return 'sent';
}
