/**
 * Day / Night / System choice for the storefront. "system" follows the device; "light" and
 * "dark" pin the theme by setting data-theme on <html>, which tokens.css and Tailwind's
 * dark variant both read. The choice lives in localStorage on this browser only.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'em-theme';
export const THEME_EVENT = 'em-theme-change';

/** Browser bar colours: Day white, Night Onyx (match layout.tsx viewport.themeColor). */
const BAR = { light: '#FFFFFF', dark: '#0B0B0C' } as const;

export const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

export function nextTheme(t: ThemeChoice): ThemeChoice {
  return THEME_ORDER[(THEME_ORDER.indexOf(t) + 1) % THEME_ORDER.length]!;
}

export function parseTheme(v: string | null | undefined): ThemeChoice {
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function readTheme(): ThemeChoice {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

/** Apply a choice to the page and remember it. */
export function setTheme(t: ThemeChoice): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  syncBarColour(t);
  try {
    if (t === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {
    // Private mode / blocked storage: the choice still applies for this page view.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Keep the mobile browser bar in step with a pinned theme (both media-tagged metas). */
function syncBarColour(t: ThemeChoice): void {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    const media = m.getAttribute('media') ?? '';
    const own = media.includes('dark') ? BAR.dark : BAR.light;
    m.setAttribute('content', t === 'system' ? own : BAR[t]);
  });
}

/**
 * Runs in <head> before first paint, so a pinned theme never flashes the other one.
 * Kept tiny and dependency-free; it mirrors setTheme's attribute logic.
 */
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
