import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '../lib/tauri';
import { runSync } from '../lib/sync';
import { useConnectivity } from './useConnectivity';

/** Flushes the outbox on reconnect and every 30s (docs/07 §6). */
export function useOfflineSync(enabled: boolean): { online: boolean; lastSync: Date | null } {
  const online = useConnectivity();
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const running = useRef(false);

  const flush = useCallback(async () => {
    if (!enabled || !isTauri || !online || running.current) return;
    running.current = true;
    try {
      await runSync();
      setLastSync(new Date());
    } catch {
      // transient — retried on the next tick
    } finally {
      running.current = false;
    }
  }, [enabled, online]);

  useEffect(() => {
    if (!enabled) return;
    void flush();
    const id = setInterval(() => void flush(), 30_000);
    return () => clearInterval(id);
  }, [enabled, flush]);

  return { online, lastSync };
}
