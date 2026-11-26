import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section } from '@/components/legal-page';
import { policy } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms of sale',
  description: 'The terms that apply when you buy from ExtraMile Electronics.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of sale" intro="Please read these before you place an order.">
      <Section title="About these terms">
        <p>
          These terms apply to every order placed on this website with ExtraMile Electronics, Accra,
          Ghana. By placing an order you agree to them. They do not affect your rights under
          Ghanaian consumer law.
        </p>
      </Section>

      <Section title="Prices and stock">
        <ul>
          <li>All prices are in Ghana cedis (GH₵) and include any taxes shown at checkout.</li>
          <li>
            The price you pay is the one calculated by our system at checkout. If a price changed
            after you added an item to your bag, your bag shows the new price before you pay.
          </li>
          <li>
            Items are reserved for {policy.reservationMinutes} minutes while you pay. If payment
            isn&apos;t completed in time, the reservation ends and the order is cancelled.
          </li>
          <li>
            In the rare case an item sells out at the same moment you pay, we will refund you in
            full and let you know.
          </li>
        </ul>
      </Section>

      <Section title="Payment">
        <p>
          Payments are processed by Paystack (mobile money, card or bank transfer). Your order is
          confirmed only once Paystack confirms the payment to us — not by the page you land on
          after paying.
        </p>
      </Section>

      <Section title="Product condition">
        <p>
          Each product page states its condition — brand new, open box, refurbished or fairly used —
          and its warranty. Photos of used items show the actual unit or one in the same condition.
        </p>
      </Section>

      <Section title="Delivery, returns and warranty">
        <p>
          See{' '}
          <Link href="/returns" className="text-primary hover:underline">
            Delivery &amp; returns
          </Link>{' '}
          and{' '}
          <Link href="/warranty" className="text-primary hover:underline">
            Warranty
          </Link>
          . Those pages form part of these terms.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          Keep your sign-in details private. You can buy as a guest; if you later create an account
          with the same email address, your earlier orders are linked to it.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          We are responsible for losses that are a foreseeable result of us breaking these terms. We
          are not responsible for losses that were not foreseeable, for business losses, or for data
          on a device you send us for repair — please back it up first.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms from time to time. The version that applies to your order is the
          one on this page when you placed it.
        </p>
      </Section>
    </LegalPage>
  );
}
