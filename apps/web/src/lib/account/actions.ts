'use server';

import type { Database } from '@extramile/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type PrivacyFormState =
  { status: 'idle' } | { status: 'saved'; message: string } | { status: 'error'; error: string };

const consentSchema = z.enum(['on', 'off']);
const deleteConfirmSchema = z.string().trim().pipe(z.literal('DELETE'));

/** Marketing email opt-in/out. The RPC updates the profile and writes consent_log together. */
export async function setMarketingConsentAction(
  _prev: PrivacyFormState,
  form: FormData,
): Promise<PrivacyFormState> {
  const parsed = consentSchema.safeParse(form.get('marketing'));
  if (!parsed.success) return { status: 'error', error: 'Choose yes or no.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error', error: 'Please sign in again.' };

  // As the user (not service role): the function acts on auth.uid() only.
  const db = supabase as unknown as SupabaseClient<Database>;
  const { error } = await db.rpc('set_marketing_consent', {
    p_granted: parsed.data === 'on',
    p_source: 'web',
  });
  if (error) return { status: 'error', error: 'Could not save your choice. Please try again.' };

  revalidatePath('/account/privacy');
  return {
    status: 'saved',
    message:
      parsed.data === 'on'
        ? "You'll get occasional offers by email."
        : "You won't get marketing emails. Order emails still arrive.",
  };
}

/**
 * Delete the signed-in customer's account (Data Protection Act right to erasure).
 * Orders are kept for tax/warranty but unlinked (detach_customer); the auth user is then
 * deleted, which cascades to the profile, addresses, carts, reviews and wishlist.
 * Requires typing DELETE, so a stray POST can't trigger it.
 */
export async function deleteAccountAction(
  _prev: PrivacyFormState,
  form: FormData,
): Promise<PrivacyFormState> {
  const confirm = deleteConfirmSchema.safeParse(form.get('confirm'));
  if (!confirm.success) {
    return { status: 'error', error: 'Type DELETE in capitals to confirm.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error', error: 'Please sign in again.' };

  const ip = clientIp(await headers());
  if (!rateLimit(`delete-account:${user.id}:${ip}`, 3, 60 * 60_000)) {
    return { status: 'error', error: 'Too many attempts. Please try again later.' };
  }

  const admin = createAdminClient();
  const { error: detachErr } = await admin.rpc('detach_customer', { p_user: user.id });
  if (detachErr) {
    if (/STAFF_ACCOUNT/.test(detachErr.message)) {
      return {
        status: 'error',
        error: 'Staff and admin accounts must be removed by an admin in the back-office.',
      };
    }
    return { status: 'error', error: 'Could not delete your account. Please contact us.' };
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    return { status: 'error', error: 'Could not delete your account. Please contact us.' };
  }

  await supabase.auth.signOut().catch(() => undefined);
  redirect('/');
}
