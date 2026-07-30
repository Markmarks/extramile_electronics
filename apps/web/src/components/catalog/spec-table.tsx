function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bIn\b/, '(in)')
    .replace(/\bMah\b/, '(mAh)')
    .replace(/\bGb\b/i, 'GB')
    .replace(/\bMp\b/, 'MP');
}

function displayValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** Spec table rendered from the category's spec_schema key order, falling back to the raw specs. */
export function SpecTable({
  specs,
  schema,
}: {
  specs: Record<string, unknown>;
  schema: Record<string, unknown>;
}) {
  const keys = Object.keys(schema).length > 0 ? Object.keys(schema) : Object.keys(specs);
  const rows = keys.filter((k) => specs[k] !== undefined && specs[k] !== null && specs[k] !== '');
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {rows.map((k) => (
            <tr key={k}>
              <th scope="row" className="py-2 pr-4 text-left font-medium text-muted-foreground">
                {humanize(k)}
              </th>
              <td className="py-2">{displayValue(specs[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
