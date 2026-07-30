import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Processing your order' };
export const dynamic = 'force-dynamic';

/**
 * Placeholder. P7 wires this to initialize Paystack and poll orders.payment_status
 * every 2s (never trusting query params). For now it confirms the order was created.
 */
export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  return (
    <main className="container max-w-lg space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Order {orderNumber} created</h1>
      <p className="text-muted-foreground">
        Payment is wired up in the next build step (P7 — Paystack). Stock is reserved for 15
        minutes.
      </p>
    </main>
  );
}
