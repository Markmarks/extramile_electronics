'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import {
  nextTheme,
  readTheme,
  setTheme,
  THEME_EVENT,
  THEME_KEY,
  type ThemeChoice,
} from '@/lib/theme';

const LABEL: Record<ThemeChoice, string> = { system: 'System', light: 'Day', dark: 'Night' };
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    // Another tab changed the theme: apply it here too.
    if (e.key === THEME_KEY) {
      setTheme(readTheme());
      onChange();
    }
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Header button that cycles System → Day → Night. */
export function ThemeToggle({ className }: { className?: string }) {
  // Server render and hydration use "system"; the real choice appears right after.
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'system' as ThemeChoice);
  const Icon = ICON[theme];
  const next = nextTheme(theme);

  // Keep the browser-bar colour right on first load for a pinned theme.
  useEffect(() => {
    const saved = readTheme();
    if (saved !== 'system') setTheme(saved);
  }, []);

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={className}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[theme]}`}
    >
      <Icon className="size-[18px]" aria-hidden />
      <span className="hidden lg:inline">{LABEL[theme]}</span>
    </button>
  );
}
