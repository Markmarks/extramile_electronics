import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactLines } from '@/components/contact-lines';
import { LegalPage, Section } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Reach ExtraMile Electronics about an order, a warranty claim or a product.',
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      intro="Questions about an order, a warranty or a product? We're here to help."
      updated={false}
    >
      <ContactLines
        fallback={
          <p className="text-[15px] text-muted-foreground">
            Our contact details are being set up. In the meantime, you can follow any order from{' '}
            <Link href="/track" className="text-primary hover:underline">
              Track an order
            </Link>
            .
          </p>
        }
      />
      <Section title="Before you get in touch">
        <ul>
          <li>
            Have your <strong>order number</strong> ready (it looks like EL-20261125-A1B2C3 and is
            in your confirmation email).
          </li>
          <li>
            For a warranty claim, keep the device&apos;s <strong>IMEI or serial number</strong> —
            it&apos;s on your receipt and warranty card.
          </li>
          <li>
            You can check an order&apos;s status yourself any time on{' '}
            <Link href="/track" className="text-primary hover:underline">
              Track an order
            </Link>
            .
          </li>
        </ul>
      </Section>
    </LegalPage>
  );
}
