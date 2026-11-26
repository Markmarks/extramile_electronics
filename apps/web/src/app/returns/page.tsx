import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section } from '@/components/legal-page';
import { policy } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Delivery & returns',
  description: 'Delivery zones, fees and how returns work at ExtraMile Electronics.',
};

export default function ReturnsPage() {
  return (
    <LegalPage
      title="Delivery & returns"
      intro="How we get your order to you, and what happens if something isn't right."
    >
      <Section title="Delivery">
        <p>
          At checkout you choose a delivery zone — Pickup, Accra Central, Greater Accra or Other
          Region. The fee and the expected delivery time for each zone are shown before you pay, and
          orders over a zone&apos;s free-delivery amount ship free.
        </p>
        <p>
          We reserve your items for {policy.reservationMinutes} minutes while you pay. Once payment
          is confirmed we pack your order, record the serial or IMEI of each device, and email you
          when it is dispatched and again when it is delivered.
        </p>
        <p>
          You can follow any order on{' '}
          <Link href="/track" className="text-primary hover:underline">
            Track an order
          </Link>
          .
        </p>
      </Section>

      <Section title="Check your order on delivery">
        <ul>
          <li>Check the box is sealed (for brand-new items) and the item matches your order.</li>
          <li>
            Compare the serial or IMEI on the device with the one on your receipt or warranty card.
          </li>
          <li>If anything is wrong, tell the rider and contact us the same day.</li>
        </ul>
      </Section>

      <Section title="Returns">
        <p>
          If an item arrives faulty, damaged or different from what you ordered, contact us within{' '}
          <strong>{policy.returnWindowDays} days of delivery</strong>. We will repair, replace or
          refund it once we have inspected it.
        </p>
        <p>To be accepted, a return must:</p>
        <ul>
          <li>come with the original box, accessories and receipt;</li>
          <li>have the same serial or IMEI we recorded when we packed it;</li>
          <li>not be damaged by misuse, liquid or unauthorised repair.</li>
        </ul>
        <p>
          Faults that appear after the return window are handled under the product&apos;s{' '}
          <Link href="/warranty" className="text-primary hover:underline">
            warranty
          </Link>
          .
        </p>
      </Section>

      <Section title="Refunds">
        <p>
          Approved refunds go back to the original payment method through Paystack (mobile money,
          card or bank). Paystack usually completes a refund within a few working days; your bank or
          network may take longer to show it.
        </p>
      </Section>

      <Section title="Cancelling an order">
        <p>
          An unpaid order cancels itself when its reservation expires. To cancel a paid order before
          it is dispatched,{' '}
          <Link href="/contact" className="text-primary hover:underline">
            contact us
          </Link>{' '}
          with your order number.
        </p>
      </Section>
    </LegalPage>
  );
}
