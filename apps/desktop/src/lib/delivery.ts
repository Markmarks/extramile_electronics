import { supabase } from './supabase';
import { refreshStorefront } from './storefront';

/**
 * Delivery zones (shipping_zones). Customers pick one at checkout; create_order() reads
 * base_fee / free_over from here and does the arithmetic in Postgres (README rule 4).
 * Staff can read every zone; only admins can add or change one (RLS, migration
 * 20261125000002). Zones are never deleted — past orders point at them — only switched off.
 */
export interface Zone {
  id: string;
  name: string;
  base_fee: number; // pesewas
  free_over: number | null; // pesewas; null = never free
  eta_days_min: number;
  eta_days_max: number;
  is_active: boolean;
}

export type ZoneInput = Omit<Zone, 'id'>;

const NOT_SAVED = 'Not saved — only an admin can change delivery zones.';

export async function listZones(): Promise<Zone[]> {
  const { data } = await supabase
    .from('shipping_zones')
    .select('id, name, base_fee, free_over, eta_days_min, eta_days_max, is_active')
    .order('base_fee')
    .returns<Zone[]>();
  return data ?? [];
}

export async function createZone(z: ZoneInput): Promise<void> {
  const { error } = await supabase.from('shipping_zones').insert(z);
  if (error) throw new Error(friendly(error.message));
  refreshStorefront();
}

export async function updateZone(id: string, z: Partial<ZoneInput>): Promise<void> {
  const { data, error } = await supabase.from('shipping_zones').update(z).eq('id', id).select('id');
  if (error) throw new Error(friendly(error.message));
  if (!data?.length) throw new Error(NOT_SAVED);
  refreshStorefront();
}

function friendly(msg: string): string {
  if (/row-level security/.test(msg)) return NOT_SAVED;
  if (/shipping_zones_eta_check/.test(msg))
    return 'The latest day must be on or after the earliest.';
  if (/shipping_zones_free_over_check/.test(msg))
    return 'Free delivery threshold must be above GH₵ 0.';
  if (/shipping_zones_fee_check/.test(msg)) return 'The fee cannot be negative.';
  if (/shipping_zones_name_check/.test(msg)) return 'Give the zone a name.';
  return msg;
}
