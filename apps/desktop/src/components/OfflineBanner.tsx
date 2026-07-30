export function OfflineBanner({ online, lastSync }: { online: boolean; lastSync: Date | null }) {
  if (online) return null;
  return (
    <div
      style={{
        background: 'hsl(var(--accent))',
        color: 'hsl(var(--accent-foreground))',
        padding: '0.4rem 1rem',
        textAlign: 'center',
        fontSize: '0.85rem',
      }}
    >
      Offline — data as of {lastSync ? lastSync.toLocaleTimeString() : 'last sync'}. Changes queue
      and sync automatically when you reconnect.
    </div>
  );
}
