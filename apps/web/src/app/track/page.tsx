import type { Metadata } from 'next';
import Link from 'next/link';
import { TrackForm } from '@/components/account/track-form';

export const metadata: Metadata = {
  title: 'Track an order',
  description: 'Check the status of your ExtraMile Electronics order.',
};

export default function TrackPage() {
  return (
    <main className="container max-w-lg space-y-6 pb-20 pt-6">
      <div className="space-y-2">
        <h1 className="large-title">Track an order</h1>
        <p className="text-[15px] text-muted-foreground">
          Enter the order number from your confirmation email and the email address you checked out
          with. Have an account?{' '}
          <Link href="/account/orders" className="text-primary hover:underline">
            See all your orders
          </Link>
          .
        </p>
      </div>
      <TrackForm />
    </main>
  );
}
