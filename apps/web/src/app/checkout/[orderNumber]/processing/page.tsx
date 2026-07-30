import type { Metadata } from 'next';
import { ProcessingPoller } from '@/components/checkout/processing';

export const metadata: Metadata = { title: 'Processing your order' };
export const dynamic = 'force-dynamic';

export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  return (
    <main className="container max-w-lg py-16 text-center">
      <ProcessingPoller orderNumber={orderNumber} />
    </main>
  );
}
