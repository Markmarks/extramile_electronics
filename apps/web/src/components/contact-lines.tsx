import { site } from '@/lib/site';

/** The shop's configured contact channels; renders nothing for unset ones. */
export function ContactLines({ fallback }: { fallback?: React.ReactNode }) {
  const lines: { label: string; value: string; href?: string }[] = [];
  if (site.supportEmail)
    lines.push({ label: 'Email', value: site.supportEmail, href: `mailto:${site.supportEmail}` });
  if (site.supportPhone)
    lines.push({
      label: 'Phone',
      value: site.supportPhone,
      href: `tel:${site.supportPhone.replace(/\s+/g, '')}`,
    });
  if (site.whatsapp)
    lines.push({
      label: 'WhatsApp',
      value: site.whatsapp,
      href: `https://wa.me/${site.whatsapp.replace(/\D/g, '')}`,
    });
  if (site.address) lines.push({ label: 'Shop', value: site.address });
  if (site.hours) lines.push({ label: 'Hours', value: site.hours });

  if (lines.length === 0) return <>{fallback ?? null}</>;
  return (
    <dl className="grouped">
      {lines.map((l) => (
        <div key={l.label} className="flex items-baseline gap-4 px-4 py-3">
          <dt className="w-24 shrink-0 text-[13px] font-semibold text-muted-foreground">
            {l.label}
          </dt>
          <dd className="text-[15px]">
            {l.href ? (
              <a href={l.href} className="text-primary hover:underline">
                {l.value}
              </a>
            ) : (
              l.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
