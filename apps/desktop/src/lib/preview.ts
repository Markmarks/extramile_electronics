import { isTauri } from './tauri';

/**
 * UI preview for design work: `vite dev` in a plain browser with `?preview` renders the
 * signed-in shell without the PIN vault. `import.meta.env.DEV` is false in `vite build`,
 * so this is compiled out of the desktop binary. It grants no data access — queries still
 * run as the anonymous role under RLS.
 */
export const isPreview =
  import.meta.env.DEV && !isTauri && new URLSearchParams(window.location.search).has('preview');
