import { WifiOff } from 'lucide-react';

export function OfflineBanner({ online, lastSync }: { online: boolean; lastSync: Date | null }) {
  if (online) return null;
  return (
    <div className="flex items-center gap-2 border-b bg-amber-500/10 px-6 py-2 text-xs text-amber-800">
      <WifiOff className="size-3.5" aria-hidden />
      Offline — showing data as of {lastSync ? lastSync.toLocaleTimeString() : 'the last sync'}.
      Changes queue and sync automatically when you reconnect.
    </div>
  );
}
