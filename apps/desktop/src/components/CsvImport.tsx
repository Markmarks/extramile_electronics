import { formatGHS } from '@extramile/core';
import { FileUp } from 'lucide-react';
import { useState } from 'react';
import { updateVariant } from '../lib/catalogue';
import { planImport, type ImportPlan, type ImportVariant } from '../lib/csvImport';
import { adjustStock } from '../lib/inventory';
import { Notice } from './ui';

/**
 * Bulk price/stock update by SKU. Step 1 reads the file and shows the plan (nothing is
 * written); step 2 applies it row by row through the normal paths — prices via the
 * catalogue update, stock via admin-actions adjust_stock (atomic, logged) — and reports
 * each failure without stopping the rest.
 */
export function CsvImport({
  variants,
  online,
  onDone,
}: {
  variants: ImportVariant[];
  online: boolean;
  onDone: (summary: string) => void;
}) {
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState<{ done: number; failed: string[] } | null>(null);
  const [running, setRunning] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setProgress(null);
    if (file.size > 5 * 1024 * 1024) {
      setPlan({
        changes: [],
        errors: [{ line: 0, message: 'File is larger than 5 MB.' }],
        unchanged: 0,
      });
      return;
    }
    setPlan(planImport(await file.text(), variants));
  }

  async function apply() {
    if (!plan) return;
    setRunning(true);
    const failed: string[] = [];
    let done = 0;
    for (const c of plan.changes) {
      try {
        if (c.price) await updateVariant(c.variantId, { priceCedis: c.price.to / 100 });
        if (c.stock)
          await adjustStock(c.variantId, c.stock.to - c.stock.from, 'count_correction', online);
        done += 1;
      } catch (err) {
        failed.push(
          `Line ${c.line} (${c.sku}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      setProgress({ done, failed: [...failed] });
    }
    setRunning(false);
    if (failed.length === 0)
      onDone(`Imported ${done} change${done === 1 ? '' : 's'} from ${fileName}.`);
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        A CSV with a <code>sku</code> column and a <code>price</code> (GH₵) and/or{' '}
        <code>stock</code> (counted on-hand) column. You&apos;ll see every change before anything is
        saved.
      </p>
      <label className="btn-secondary cursor-pointer">
        <FileUp className="size-3.5" aria-hidden /> {fileName || 'Choose CSV file…'}
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => void pick(e)}
        />
      </label>

      {plan && (
        <>
          <p className="text-[13px]">
            <strong>{plan.changes.length}</strong> to change · {plan.unchanged} unchanged ·{' '}
            <span className={plan.errors.length ? 'text-destructive' : ''}>
              {plan.errors.length} error{plan.errors.length === 1 ? '' : 's'}
            </span>
          </p>
          {plan.errors.length > 0 && (
            <ul className="max-h-32 overflow-y-auto rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {plan.errors.slice(0, 200).map((e, i) => (
                <li key={i}>
                  {e.line ? `Line ${e.line}: ` : ''}
                  {e.message}
                </li>
              ))}
            </ul>
          )}
          {plan.changes.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.changes.slice(0, 500).map((c) => (
                    <tr key={c.line}>
                      <td className="font-mono text-xs">{c.sku}</td>
                      <td className="text-right tabular-nums">
                        {c.price ? `${formatGHS(c.price.from)} → ${formatGHS(c.price.to)}` : '—'}
                      </td>
                      <td className="text-right tabular-nums">
                        {c.stock ? `${c.stock.from} → ${c.stock.to}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!online && plan.changes.some((c) => c.price) && (
            <Notice tone="info">Price changes need a connection; stock changes will queue.</Notice>
          )}
          {progress && (
            <Notice tone={progress.failed.length ? 'error' : 'info'}>
              {progress.done} of {plan.changes.length} applied
              {progress.failed.length ? ` · ${progress.failed.length} failed:` : ''}
              {progress.failed.slice(0, 20).map((f) => (
                <span key={f} className="block">
                  {f}
                </span>
              ))}
            </Notice>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              disabled={
                running || plan.changes.length === 0 || (!!progress && !progress.failed.length)
              }
              onClick={() => void apply()}
            >
              {running
                ? `Applying… ${progress?.done ?? 0}/${plan.changes.length}`
                : `Apply ${plan.changes.length} change${plan.changes.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
