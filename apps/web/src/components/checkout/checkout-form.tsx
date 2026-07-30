'use client';

import { formatGHS } from '@extramile/core';
import { Button } from '@extramile/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { quoteAction } from '@/lib/checkout/actions';
import type { CheckoutQuote, ShippingZoneView } from '@/lib/checkout/quote';

export interface AddressView {
  id: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  landmark: string | null;
}

const input =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function CheckoutForm({
  zones,
  addresses,
  initialQuote,
  defaultEmail,
}: {
  zones: ShippingZoneView[];
  addresses: AddressView[];
  initialQuote: CheckoutQuote;
  defaultEmail: string;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<CheckoutQuote>(initialQuote);
  const [refreshing, startRefresh] = useTransition();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState('');
  const [zoneId, setZoneId] = useState(initialQuote.zoneId ?? zones[0]?.id ?? '');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(initialQuote.couponCode);

  const [addr, setAddr] = useState({
    recipient: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    region: '',
    landmark: '',
  });

  function refresh(nextZone: string, coupon: string | null) {
    startRefresh(async () => {
      const q = await quoteAction(nextZone || null, coupon);
      setQuote(q);
      setAppliedCoupon(q.couponCode);
    });
  }

  function onZoneChange(id: string) {
    setZoneId(id);
    refresh(id, appliedCoupon);
  }

  function applyCoupon() {
    if (!couponInput.trim()) return;
    refresh(zoneId, couponInput);
  }
  function removeCoupon() {
    setCouponInput('');
    refresh(zoneId, null);
  }

  function pickAddress(id: string) {
    const a = addresses.find((x) => x.id === id);
    if (!a) return;
    setAddr({
      recipient: a.recipient,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2 ?? '',
      city: a.city,
      region: a.region,
      landmark: a.landmark ?? '',
    });
    setPhone((p) => p || a.phone);
  }

  async function placeOrder() {
    setError(null);
    if (
      !email ||
      !phone ||
      !zoneId ||
      !addr.recipient ||
      !addr.line1 ||
      !addr.city ||
      !addr.region
    ) {
      setError('Please fill in your contact and delivery details.');
      return;
    }
    setPlacing(true);
    try {
      const res = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          phone,
          zoneId,
          couponCode: appliedCoupon ?? undefined,
          shipTo: {
            recipient: addr.recipient,
            phone: addr.phone || phone,
            line1: addr.line1,
            line2: addr.line2 || undefined,
            city: addr.city,
            region: addr.region,
            landmark: addr.landmark || undefined,
          },
        }),
      });
      const data: { orderNumber?: string; orderId?: string; error?: string } = await res.json();
      if (!res.ok || !data.orderNumber || !data.orderId) {
        setError(data.error ?? 'Could not place your order.');
        setPlacing(false);
        return;
      }
      window.dispatchEvent(new Event('cart:changed'));

      // Initialize Paystack and redirect to the hosted checkout.
      try {
        const payRes = await fetch('/api/checkout/pay', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId: data.orderId }),
        });
        const pay: { authorizationUrl?: string } = await payRes.json();
        if (pay.authorizationUrl) {
          window.location.href = pay.authorizationUrl;
          return;
        }
      } catch {
        // fall through to the processing page, which keeps polling
      }
      router.push(`/checkout/${data.orderNumber}/processing`);
    } catch {
      setError('Network error. Please try again.');
      setPlacing(false);
    }
  }

  const selectedZone = zones.find((z) => z.id === zoneId);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-8">
        {/* Contact */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Contact</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Email</span>
              <input
                type="email"
                className={input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Phone (MoMo)</span>
              <input
                type="tel"
                placeholder="0244 123 456"
                className={input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>
        </section>

        {/* Delivery */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Delivery</h2>

          {addresses.length > 0 && (
            <label className="space-y-1 text-sm">
              <span>Use a saved address</span>
              <select
                className={input}
                defaultValue=""
                onChange={(e) => pickAddress(e.target.value)}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.recipient} — {a.line1}, {a.city}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={input}
              placeholder="Recipient name"
              value={addr.recipient}
              onChange={(e) => setAddr({ ...addr, recipient: e.target.value })}
            />
            <input
              className={input}
              placeholder="Recipient phone"
              value={addr.phone}
              onChange={(e) => setAddr({ ...addr, phone: e.target.value })}
            />
            <input
              className={`${input} sm:col-span-2`}
              placeholder="Address line 1"
              value={addr.line1}
              onChange={(e) => setAddr({ ...addr, line1: e.target.value })}
            />
            <input
              className={`${input} sm:col-span-2`}
              placeholder="Address line 2 (optional)"
              value={addr.line2}
              onChange={(e) => setAddr({ ...addr, line2: e.target.value })}
            />
            <input
              className={input}
              placeholder="City / town"
              value={addr.city}
              onChange={(e) => setAddr({ ...addr, city: e.target.value })}
            />
            <input
              className={input}
              placeholder="Region"
              value={addr.region}
              onChange={(e) => setAddr({ ...addr, region: e.target.value })}
            />
            <input
              className={`${input} sm:col-span-2`}
              placeholder="Landmark (optional)"
              value={addr.landmark}
              onChange={(e) => setAddr({ ...addr, landmark: e.target.value })}
            />
          </div>

          <label className="space-y-1 text-sm">
            <span>Delivery zone</span>
            <select className={input} value={zoneId} onChange={(e) => onZoneChange(e.target.value)}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} — {z.baseFee === 0 ? 'Free' : formatGHS(z.baseFee)} ({z.etaMin}–
                  {z.etaMax} days)
                </option>
              ))}
            </select>
          </label>
        </section>
      </div>

      {/* Summary */}
      <aside className="h-fit space-y-4 rounded-lg border p-5 lg:sticky lg:top-20">
        <h2 className="text-lg font-semibold">Order summary</h2>

        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              className={input}
              placeholder="Coupon code"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              disabled={Boolean(appliedCoupon)}
            />
            {appliedCoupon ? (
              <Button type="button" variant="outline" onClick={removeCoupon}>
                Remove
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={applyCoupon} disabled={refreshing}>
                Apply
              </Button>
            )}
          </div>
          {appliedCoupon && <p className="text-xs text-success">Applied {appliedCoupon}.</p>}
          {quote.couponError && <p className="text-xs text-destructive">{quote.couponError}</p>}
        </div>

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal ({quote.itemCount})</dt>
            <dd>{formatGHS(quote.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>{quote.shipping === 0 ? 'Free' : formatGHS(quote.shipping)}</dd>
          </div>
          {quote.discount > 0 && (
            <div className="flex justify-between text-success">
              <dt>Discount</dt>
              <dd>−{formatGHS(quote.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatGHS(quote.total)}</dd>
          </div>
          {selectedZone && (
            <p className="pt-1 text-xs text-muted-foreground">
              Arrives in {selectedZone.etaMin}–{selectedZone.etaMax} days.
            </p>
          )}
        </dl>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full" size="lg" onClick={placeOrder} disabled={placing || refreshing}>
          {placing ? 'Placing order…' : `Pay ${formatGHS(quote.total)}`}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          You&apos;ll pay securely via Paystack (mobile money, card, bank).
        </p>
      </aside>
    </div>
  );
}
