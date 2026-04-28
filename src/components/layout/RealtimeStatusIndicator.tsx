import { useEffect, useState } from 'react';
import { Wifi, WifiOff, Loader2, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRealtimeStatus } from '@/hooks/useRealtimeStatus';
import { cn } from '@/lib/utils';

/**
 * Top-of-page banner that appears when the realtime connection
 * is degraded or fully disconnected. Auto-hides on recovery.
 *
 * Mounted globally in MainLayout so it surfaces on every page.
 */
export function RealtimeStatusBanner() {
  const status = useRealtimeStatus();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissal when situation changes for the worse or recovers
  useEffect(() => {
    if (status.overall === 'connected') setDismissed(false);
  }, [status.overall]);

  if (status.overall === 'connected' || status.overall === 'connecting') return null;
  if (dismissed) return null;

  const isDisconnected = status.overall === 'disconnected';
  const isDegraded = status.overall === 'degraded';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-3 border-b px-4 py-2 text-sm',
        isDisconnected
          ? 'bg-destructive/10 border-destructive/30 text-destructive'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400',
      )}
    >
      {isDisconnected ? (
        <WifiOff className="h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className="font-medium">
          {isDisconnected
            ? 'Connessione realtime persa'
            : 'Connessione realtime instabile'}
        </span>
        <span className="ml-2 text-xs opacity-80">
          {isDegraded
            ? `${status.connectedChannels}/${status.totalChannels} canali attivi · retry automatico in corso`
            : `Tentativo di riconnessione automatica (#${status.maxRetryCount})`}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setDismissed(true)}
          aria-label="Chiudi avviso"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Compact icon badge for the header area. Always visible, color-coded.
 */
export function RealtimeStatusBadge() {
  const status = useRealtimeStatus();

  const variant =
    status.overall === 'connected'
      ? { icon: Wifi, color: 'text-emerald-500', label: 'Realtime attivo' }
      : status.overall === 'connecting'
        ? { icon: Loader2, color: 'text-muted-foreground animate-spin', label: 'Connessione…' }
        : status.overall === 'degraded'
          ? { icon: AlertTriangle, color: 'text-amber-500', label: 'Realtime parziale' }
          : { icon: WifiOff, color: 'text-destructive', label: 'Realtime offline' };

  const Icon = variant.icon;
  return (
    <div
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`${variant.label} (${status.connectedChannels}/${status.totalChannels})`}
      aria-label={variant.label}
    >
      <Icon className={cn('h-3.5 w-3.5', variant.color)} />
    </div>
  );
}
