import { useAuth } from './auth/AuthProvider';
import { PinScreen } from './auth/PinScreen';
import { useIdleLock } from './hooks/useIdleLock';
import { isPreview } from './lib/preview';
import { Shell } from './screens/Shell';

const IDLE_MS = 15 * 60 * 1000;

export function App() {
  const { phase, lock } = useAuth();
  useIdleLock(phase === 'ready', IDLE_MS, lock);

  if (isPreview) return <Shell />;
  if (phase === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }
  if (phase !== 'ready') return <PinScreen />;
  return <Shell />;
}
