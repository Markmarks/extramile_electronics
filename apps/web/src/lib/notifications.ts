import 'server-only';

import { sendEmail } from '@/lib/email/send';
import { createAdminClient } from '@/lib/supabase/admin';

export type NotificationEvent =
  'order_confirmation' | 'payment_receipt' | 'dispatch' | 'delivery' | 'refund';

export type NotifyResult = 'sent' | 'duplicate' | 'suppressed' | 'skipped';

/**
 * Send a transactional email exactly once per (order, event, channel).
 * The unique row in `notifications` is reserved BEFORE sending; a send failure
 * releases the reservation so it can be retried (docs/06 P8: "exactly one email
 * even if the action is retried").
 */
export async function notifyOnce(params: {
  orderId: string;
  event: NotificationEvent;
  to: string;
  subject: string;
  html: string;
  channel?: 'email' | 'sms';
}): Promise<NotifyResult> {
  const admin = createAdminClient();
  const channel = params.channel ?? 'email';

  const { error } = await admin
    .from('notifications')
    .insert({ order_id: params.orderId, event: params.event, channel });
  if (error) return 'duplicate'; // unique violation — already sent

  try {
    const result = await sendEmail({ to: params.to, subject: params.subject, html: params.html });
    return result; // 'sent' | 'suppressed' | 'skipped'
  } catch (err) {
    await admin
      .from('notifications')
      .delete()
      .eq('order_id', params.orderId)
      .eq('event', params.event)
      .eq('channel', channel);
    throw err;
  }
}
