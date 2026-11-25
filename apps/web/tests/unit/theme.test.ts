import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nextTheme, parseTheme, THEME_KEY, THEME_ORDER, themeBootScript } from '@/lib/theme';

describe('theme choice', () => {
  it('cycles System → Day → Night → System', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    for (const t of THEME_ORDER) expect(THEME_ORDER).toContain(nextTheme(t));
  });

  it('treats anything unexpected in storage as System', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    for (const v of [null, undefined, '', 'system', 'DARK', '<script>']) {
      expect(parseTheme(v)).toBe('system');
    }
  });

  it('boot script only ever sets light or dark from the same storage key', () => {
    expect(themeBootScript).toContain(`localStorage.getItem('${THEME_KEY}')`);
    expect(themeBootScript).toMatch(/t==='light'\|\|t==='dark'/);
  });
});

describe('tokens.css night palette', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../../../packages/ui/src/styles/tokens.css', import.meta.url)),
    'utf8',
  );
  const block = (selector: string) => {
    const i = css.indexOf(selector);
    expect(i, `${selector} present`).toBeGreaterThan(-1);
    const open = css.indexOf('{', i);
    return css.slice(open + 1, css.indexOf('}', open)).trim();
  };

  it('device-dark and picked-Night blocks are identical', () => {
    const viaDevice = block(":root:not([data-theme='light'])");
    const viaChoice = block(":root[data-theme='dark']");
    expect(viaDevice).toContain('--background: 240 4% 5%');
    expect(viaChoice).toBe(viaDevice);
  });

  it('night palette is screen-only so paper prints in the day palette', () => {
    expect(css).toMatch(/@media screen and \(prefers-color-scheme: dark\)/);
    expect(css).toMatch(/@media screen \{\s*:root\[data-theme='dark'\]/);
  });
});
