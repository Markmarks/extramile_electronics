import { Printer, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field } from '../components/Modal';
import { Notice, PageHeader } from '../components/ui';
import { listPrinters, printTest } from '../lib/print';
import { loadSettings, saveSettings, SPOOL_PRINTER, type DeskSettings } from '../lib/settings';
import { isTauri } from '../lib/tauri';

/** Counter-PC preferences (docs/07 §4): printer, receipt header/footer, label copies. */
export function Settings() {
  const [s, setS] = useState<DeskSettings>(loadSettings);
  const [printers, setPrinters] = useState<string[]>([SPOOL_PRINTER]);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    null,
  );

  useEffect(() => {
    void listPrinters()
      .then((p) => setPrinters(p.length ? p : [SPOOL_PRINTER]))
      .catch(() => setPrinters([SPOOL_PRINTER]));
  }, []);

  const set = <K extends keyof DeskSettings>(k: K, v: DeskSettings[K]) =>
    setS((cur) => ({ ...cur, [k]: v }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    setS(saveSettings(s));
    setMessage({ tone: 'ok', text: 'Settings saved on this PC.' });
  }

  async function test() {
    setMessage(null);
    try {
      setMessage({ tone: 'ok', text: `Test page ${await printTest(s.printer)}.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  }

  // A printer saved earlier that Windows no longer lists stays selectable (and visible).
  const options = printers.includes(s.printer) ? printers : [...printers, s.printer];

  return (
    <form className="mx-auto max-w-2xl space-y-4" onSubmit={save}>
      <PageHeader
        title="Settings"
        subtitle="Saved on this PC only"
        actions={
          <button type="submit" className="btn-primary">
            <Save className="size-3.5" aria-hidden /> Save
          </button>
        }
      />

      <section className="card space-y-4 p-4">
        <h2 className="card-title">Printing</h2>
        <Field
          label="Receipt & label printer"
          hint={
            isTauri
              ? 'Jobs are saved as ESC/POS spool files for now; sending straight to a Windows printer is coming in a later release.'
              : 'Printing works in the desktop app only.'
          }
        >
          <div className="flex gap-2">
            <select
              className="input"
              value={s.printer}
              onChange={(e) => set('printer', e.target.value)}
            >
              {options.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button type="button" className="btn-secondary shrink-0" onClick={() => void test()}>
              <Printer className="size-3.5" aria-hidden /> Test print
            </button>
          </div>
        </Field>
        <Field label="Labels per print (default)">
          <input
            className="input w-24"
            inputMode="numeric"
            value={s.labelCopies}
            onChange={(e) => set('labelCopies', Number(e.target.value) || 1)}
          />
        </Field>
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="card-title">Receipt</h2>
        <Field label="Header" hint="Under the logo line, e.g. shop address and phone.">
          <textarea
            className="input min-h-16"
            maxLength={120}
            value={s.receiptHeader}
            onChange={(e) => set('receiptHeader', e.target.value)}
          />
        </Field>
        <Field label="Footer" hint="Bottom of every receipt, e.g. returns policy.">
          <textarea
            className="input min-h-16"
            maxLength={200}
            value={s.receiptFooter}
            onChange={(e) => set('receiptFooter', e.target.value)}
          />
        </Field>
        <Notice tone="info">
          Tax lines (VAT / NHIL / GETFund) will appear here once the shop&apos;s VAT status is
          decided.
        </Notice>
      </section>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </form>
  );
}
