'use server';

import { assertTransition, type OrderStatus } from '@extramile/core';
import { revalidatePath } from 'next/cache';
import { dispatchEmail, deliveryEmail } from '@/lib/email/templates';
import { notifyOnce, type NotificationEvent } from '@/lib/notifications';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type TransitionResult = { ok: true } | { ok: false; error: string };

async function requireStaffId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .returns<{ role: string }[]>();
  const role = data?.[0]?.role;
  return role === 'staff' || role === 'admin' ? user.id : null;
}

const EVENT_FOR: Partial<Record<OrderStatus, NotificationEvent>> = {
  dispatched: 'dispatch',
  delivered: 'delivery',
};

/** Staff-only forward transition: update status, audit, send exactly one email. */
export async function advanceOrderAction(
  orderId: string,
  to: OrderStatus,
): Promise<TransitionResult> {
  const actor = await requireStaffId();
  if (!actor) return { ok: false, error: 'Not authorised.' };

  const admin = createAdminClient();
  const { data } = await admin
    .from('orders')
    .select('id, order_number, email, status, total')
    .eq('id', orderId)
    .limit(1)
    .returns<
      { id: string; order_number: string; email: string; status: OrderStatus; total: number }[]
    >();
  const order = data?.[0];
  if (!order) return { ok: false, error: 'Order not found.' };

  try {
    assertTransition(order.status, to);
  } catch {
    return { ok: false, error: `Cannot move ${order.status} → ${to}.` };
  }

  const { error } = await admin.from('orders').update({ status: to }).eq('id', orderId);
  if (error) return { ok: false, error: error.message };

  await admin.from('audit_log').insert({
    actor,
    action: `order.${to}`,
    entity: 'orders',
    entity_id: orderId,
    before: { status: order.status },
    after: { status: to },
  });

  const event = EVENT_FOR[to];
  if (event) {
    const tmpl =
      event === 'dispatch'
        ? dispatchEmail({ orderNumber: order.order_number, total: order.total, items: [] })
        : deliveryEmail({ orderNumber: order.order_number, total: order.total, items: [] });
    try {
      await notifyOnce({
        orderId,
        event,
        to: order.email,
        subject: tmpl.subject,
        html: tmpl.html,
      });
    } catch {
      // email failure is non-fatal to the transition; notifyOnce released its slot
    }
  }

  revalidatePath(`/account/orders/${order.order_number}`);
  revalidatePath('/admin');
  return { ok: true };
}
