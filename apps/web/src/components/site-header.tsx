import Link from 'next/link';
import { CartCount } from '@/components/cart/cart-count';

/** Static header — no cookies here, so pages keep their static/ISR rendering. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between gap-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          ExtraMile <span className="text-accent">Electronics</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/search" className="hover:text-primary">
            Search
          </Link>
          <Link href="/account/orders" className="hover:text-primary">
            Orders
          </Link>
          <Link href="/cart" className="relative hover:text-primary">
            Cart
            <CartCount />
          </Link>
        </nav>
      </div>
    </header>
  );
}
