import { LEGAL_UPDATED } from '@/lib/site';

/** Shared reading layout for the help and legal pages. */
export function LegalPage({
  title,
  intro,
  updated = true,
  children,
}: {
  title: string;
  intro?: string;
  updated?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="container max-w-2xl pb-20 pt-6">
      <h1 className="large-title">{title}</h1>
      {intro && <p className="mt-3 text-[17px] text-muted-foreground">{intro}</p>}
      {updated && (
        <p className="mt-2 text-[13px] text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      )}
      <div className="mt-8 space-y-8">{children}</div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/85 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
