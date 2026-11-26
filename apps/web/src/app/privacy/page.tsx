import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactLines } from '@/components/contact-lines';
import { LegalPage, Section } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What personal data ExtraMile Electronics collects, why, and your rights over it.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="We collect only what we need to sell, deliver and support your devices, and we never sell your data."
    >
      <Section title="Who we are">
        <p>
          ExtraMile Electronics is an electronics retailer in Accra, Ghana. We are the data
          controller for the personal data described here, which we handle in line with the Data
          Protection Act, 2012 (Act 843).
        </p>
      </Section>

      <Section title="What we collect">
        <ul>
          <li>
            <strong>Contact details</strong> — your email address and phone number, so we can
            confirm orders and reach you about delivery.
          </li>
          <li>
            <strong>Delivery details</strong> — the name, address and landmark you give us.
          </li>
          <li>
            <strong>Orders</strong> — what you bought, prices paid, and the serial or IMEI of each
            device, which is your warranty record.
          </li>
          <li>
            <strong>Account details</strong> — if you create an account: your sign-in email and, if
            you use them, your Google or Apple sign-in. We never see your Google or Apple password.
          </li>
          <li>
            <strong>Reviews</strong> you choose to write.
          </li>
          <li>
            <strong>Payment confirmation</strong> — Paystack tells us whether a payment succeeded
            and its reference. Your card number and mobile money PIN go to Paystack only; we never
            receive them.
          </li>
        </ul>
      </Section>

      <Section title="Why we use it">
        <ul>
          <li>To take payment for, pack, deliver and support your order.</li>
          <li>To keep the warranty and tax records the law and your warranty require.</li>
          <li>To send emails about your order (confirmation, dispatch, delivery, refunds).</li>
          <li>To prevent fraud and keep the shop secure.</li>
          <li>To send offers — only if you have opted in, and you can opt out at any time.</li>
        </ul>
      </Section>

      <Section title="Who we share it with">
        <p>
          Only service providers that help us run the shop, under contracts that limit how they use
          your data:
        </p>
        <ul>
          <li>Paystack — payments and refunds.</li>
          <li>Supabase — our database, sign-in and file storage.</li>
          <li>Resend — order emails.</li>
          <li>Our hosting provider — serving this website.</li>
          <li>Delivery riders — your name, phone and delivery address for that order only.</li>
        </ul>
        <p>
          Some of these providers store data outside Ghana. We do not sell or rent your personal
          data to anyone.
        </p>
      </Section>

      <Section title="Cookies">
        <p>We use only the cookies the shop needs to work:</p>
        <ul>
          <li>a bag cookie that remembers what you added before checkout;</li>
          <li>a sign-in cookie that keeps you signed in;</li>
          <li>your Day/Night display preference.</li>
        </ul>
        <p>We do not use advertising or cross-site tracking cookies.</p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Order, payment and warranty records are kept for as long as the law requires for tax and
          accounting, and at least for the warranty period of what you bought. Account details are
          kept until you delete your account. Unfinished bags are cleared automatically.
        </p>
      </Section>

      <Section title="Your rights">
        <p>You can ask us to:</p>
        <ul>
          <li>give you a copy of the personal data we hold about you;</li>
          <li>correct anything that is wrong;</li>
          <li>delete your account and personal data we don&apos;t have to keep;</li>
          <li>stop sending you marketing.</li>
        </ul>
        <p>
          If you have an account, you can download your data, change your marketing choice or delete
          your account yourself on{' '}
          <Link href="/account/privacy" className="text-primary hover:underline">
            Your data &amp; privacy
          </Link>
          . Otherwise,{' '}
          <Link href="/contact" className="text-primary hover:underline">
            contact us
          </Link>
          . You may also complain to Ghana&apos;s Data Protection Commission.
        </p>
      </Section>

      <Section title="Contact">
        <ContactLines
          fallback={
            <p>
              Use the details on our{' '}
              <Link href="/contact" className="text-primary hover:underline">
                contact page
              </Link>
              .
            </p>
          }
        />
      </Section>
    </LegalPage>
  );
}
