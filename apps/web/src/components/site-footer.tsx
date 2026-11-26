import Link from 'next/link';
import { site } from '@/lib/site';

const groups: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Shop',
    links: [
      { href: '/search', label: 'Search' },
      { href: '/track', label: 'Track an order' },
      { href: '/account', label: 'Your account' },
    ],
  },
  {
    title: 'Help',
    links: [
      { href: '/returns', label: 'Delivery & returns' },
      { href: '/warranty', label: 'Warranty' },
      { href: '/contact', label: 'Contact us' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms of sale' },
    ],
  },
];

/** Static footer — no cookies, so pages keep their static/ISR rendering. */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-background print:hidden">
      <div className="container grid gap-8 py-10 sm:grid-cols-3">
        {groups.map((g) => (
          <nav key={g.title} aria-label={g.title} className="space-y-3">
            <p className="text-[13px] font-semibold text-muted-foreground">{g.title}</p>
            <ul className="space-y-2">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[15px] text-foreground/80 transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="container flex flex-wrap items-center justify-between gap-2 border-t py-5 text-[13px] text-muted-foreground">
        <p>
          © {new Date().getFullYear()} {site.name} · Accra, Ghana
        </p>
        <p>Payments secured by Paystack — we never see your card or MoMo PIN.</p>
      </div>
    </footer>
  );
}
