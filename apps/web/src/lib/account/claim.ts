import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Link guest orders placed with this user's email to their account (PRD §4.7 "post-purchase
 * account claim").
 *
 * Call it ONLY from /auth/callback, right after the code exchange. Reaching the callback
 * proves control of the inbox (magic link, OTP, signup confirmation, password reset) or a
 * provider-verified email (Google/Apple). A plain password sign-in proves neither — if the
 * project ever auto-confirms signups, anyone could register as someone@example.com and
 * take that person's guest orders — so it must not trigger a claim.
 * `user` must come from the verified session, never from client input.
 * Never throws — a failed claim must not block sign-in.
 */
export async function claimGuestOrders(user: User): Promise<number> {
  if (!user.email || !user.email_confirmed_at) return 0;
  try {
    const { data, error } = await createAdminClient().rpc('claim_guest_orders', {
      p_user: user.id,
      p_email: user.email,
    });
    return error ? 0 : (data ?? 0);
  } catch {
    return 0;
  }
}
