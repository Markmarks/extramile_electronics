import { useEffect } from 'react';

/** Calls onIdle after `timeoutMs` of no user activity (docs/07 §5 — 15 min idle lock). */
export function useIdleLock(enabled: boolean, timeoutMs: number, onIdle: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(onIdle, timeoutMs);
    };
    const events = ['mousemove', 'keydown', 'mousedown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [enabled, timeoutMs, onIdle]);
}
