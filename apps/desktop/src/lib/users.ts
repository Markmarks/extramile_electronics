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

// ── Back-office devices (staff_devices) ─────────────────────────────────────────
// Each back-office PC registers itself on enrol/unlock (register_staff_device RPC).
// Admins can revoke a lost/stolen PC: it is wiped at its next unlock and refused by
// admin-actions immediately. Revoke/restore are admin-only server-side.

export interface DeviceRow {
  device_id: string;
  label: string | null;
  os: string | null;
  app_version: string | null;
  is_revoked: boolean;
  last_seen_at: string;
  profiles: { full_name: string | null } | null;
}

export async function listDevices(): Promise<DeviceRow[]> {
  const { data } = await supabase
    .from('staff_devices')
    .select('device_id, label, os, app_version, is_revoked, last_seen_at, profiles(full_name)')
    .order('last_seen_at', { ascending: false })
    .returns<DeviceRow[]>();
  return data ?? [];
}

export async function setDeviceRevoked(deviceId: string, revoked: boolean): Promise<void> {
  await invokeAdminAction(revoked ? 'device_revoke' : 'device_restore', { device_id: deviceId });
}
