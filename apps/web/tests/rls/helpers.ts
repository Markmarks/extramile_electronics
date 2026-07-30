import type { Database } from '@extramile/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * RLS test harness. Talks to a LOCAL Supabase (the well-known demo keys below are
 * the public defaults printed by `supabase start` — not secrets). Every assertion
 * must use the anon/authed client, never service_role, so the policies are exercised.
 */

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';
const LOCAL_SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_URL;
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? LOCAL_ANON;
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE;

/** These tests only run when explicitly enabled against a live local stack. */
export const RLS_ENABLED = process.env.RUN_RLS === '1';

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(URL, ANON, { auth: { persistSession: false } });
}

export function serviceClient(): SupabaseClient<Database> {
  return createClient<Database>(URL, SERVICE, { auth: { persistSession: false } });
}

let seq = 0;
export function uniqueEmail(prefix: string): string {
  seq += 1;
  return `${prefix}.${Date.now()}.${seq}@rls.test`;
}

const PASSWORD = 'Test-Passw0rd!';

/** Create an email-confirmed user via the admin API and return their id. */
export async function createConfirmedUser(email: string): Promise<string> {
  const svc = serviceClient();
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

/** Sign a user in and return a client scoped to their session. */
export async function signInAs(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return client;
}

export async function setRole(
  userId: string,
  role: Database['public']['Enums']['user_role'],
): Promise<void> {
  const svc = serviceClient();
  const { error } = await svc.from('profiles').update({ role }).eq('id', userId);
  if (error) throw new Error(`setRole failed: ${error.message}`);
}
