import { Logo } from '@extramile/ui';
import { Package, Search, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { CartCount } from '@/components/cart/cart-count';
import { ThemeToggle } from '@/components/theme-toggle';

const navItem =
  'pressable relative flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground';

/** Static header — no cookies here, so pages keep their static/ISR rendering. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background print:hidden">
      <div className="container flex h-14 items-center justify-between gap-4">
        <Link href="/" aria-label="ExtraMile Electronics home" className="text-[19px]">
          <Logo markClassName="h-7" />
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/search" className={navItem} aria-label="Search">
            <Search className="size-[18px]" aria-hidden />
            <span className="hidden sm:inline">Search</span>
          </Link>
          <Link href="/account/orders" className={navItem} aria-label="Orders">
            <Package className="size-[18px]" aria-hidden />
            <span className="hidden sm:inline">Orders</span>
          </Link>
          <Link href="/cart" className={navItem} aria-label="Cart">
            <ShoppingBag className="size-[18px]" aria-hidden />
            <span className="hidden sm:inline">Cart</span>
            <CartCount />
          </Link>
          <ThemeToggle className={navItem} />
        </nav>
      </div>
    </header>
  );
}
