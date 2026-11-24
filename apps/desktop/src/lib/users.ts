import type { Enums } from '@extramile/core';
import { supabase } from './supabase';
import { invokeAdminAction } from './adminActions';

// User management. Reads use the staff JWT directly (RLS `own_profile` lets staff
// read every profile). Mutations go through the `admin-actions` Edge Function, which
// is admin-only server-side (role_change, staff_invite) — the desktop gates the UI to
// admins too, but the server is the real boundary.

export type Role = Enums<'user_role'>;
export const ROLES: Role[] = ['customer', 'staff', 'admin'];

export interface UserRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  created_at: string;
}

export async function listUsers(): Promise<UserRow[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
    .returns<UserRow[]>();
  return data ?? [];
}

export async function changeRole(userId: string, role: Role): Promise<void> {
  await invokeAdminAction('role_change', { user_id: userId, role });
}

export async function inviteStaff(email: string, role: Role): Promise<void> {
  await invokeAdminAction('staff_invite', { email, role });
}
