import { toCsv } from '@extramile/core';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';

/**
 * Save a CSV to Documents\ExtraMile Exports (desktop app) or download it (browser preview).
 * Returns where it went. The Rust side picks the folder and sanitises the name.
 */
export async function saveCsv(
  name: string,
  rows: (string | number | null | undefined)[][],
): Promise<string> {
  const contents = toCsv(rows);
  if (isTauri) return invoke<string>('write_export', { name, ext: 'csv', contents });

  const url = URL.createObjectURL(new Blob(['﻿', contents], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w-]/g, '_')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return `downloaded ${a.download}`;
}
