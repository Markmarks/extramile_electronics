import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Warranty',
  description: 'How warranties work at ExtraMile Electronics and how to make a claim.',
};

export default function WarrantyPage() {
  return (
    <LegalPage
      title="Warranty"
      intro="Every device we sell is recorded against your order by serial or IMEI, so your warranty is always on file."
    >
      <Section title="How long you're covered">
        <p>
          Each product page shows its warranty length and who provides it — for example
          &quot;12-month warranty, Apple Ghana&quot;. The warranty starts on the day your order is
          delivered (or collected).
        </p>
        <p>
          Fairly used, open-box and refurbished items carry the warranty shown on their own product
          page, which may be shorter than for a brand-new item.
        </p>
      </Section>

      <Section title="What's covered">
        <ul>
          <li>Manufacturing faults and hardware failures under normal use.</li>
          <li>Faults that were present when the item was delivered.</li>
        </ul>
      </Section>

      <Section title="What isn't covered">
        <ul>
          <li>Accidental damage, cracked screens, liquid damage or misuse.</li>
          <li>Repairs or modifications by anyone other than us or the warranty provider.</li>
          <li>Normal wear, such as battery capacity dropping with age.</li>
          <li>A device whose serial or IMEI does not match the one on your order.</li>
        </ul>
      </Section>

      <Section title="Making a claim">
        <ol className="ml-5 list-decimal space-y-1.5">
          <li>
            Find your order number and the device&apos;s serial or IMEI — both are on your receipt
            and in{' '}
            <Link href="/account/orders" className="text-primary hover:underline">
              your orders
            </Link>
            .
          </li>
          <li>
            <Link href="/contact" className="text-primary hover:underline">
              Contact us
            </Link>{' '}
            with a short description of the fault.
          </li>
          <li>
            We&apos;ll check the device, then repair or replace it, or pass the claim to the
            manufacturer&apos;s service centre where they provide the warranty.
          </li>
        </ol>
      </Section>
    </LegalPage>
  );
}
