import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, WifiOff, Loader2, RefreshCw, Activity, Zap } from 'lucide-react';
import { useRealtimeStatus, realtimeStatusStore, type ChannelStatus, type RealtimeTelemetry } from '@/hooks/useRealtimeStatus';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

const STATUS_META: Record<ChannelStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  connected: { label: 'Connesso', variant: 'default', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
  connecting: { label: 'In connessione', variant: 'secondary', className: '' },
  reconnecting: { label: 'Riconnessione', variant: 'outline', className: 'border-amber-500/50 text-amber-700 dark:text-amber-400' },
  error: { label: 'Errore', variant: 'destructive', className: '' },
};

export function RealtimeStatusPanel() {
  const status = useRealtimeStatus();
  const channels = Array.from(realtimeStatusStore.snapshot().entries());

  // Re-render telemetry every 5s and on store changes
  const [telemetry, setTelemetry] = useState<RealtimeTelemetry>(() => realtimeStatusStore.getTelemetry());
  useEffect(() => {
    const update = () => setTelemetry(realtimeStatusStore.getTelemetry());
    const unsub = realtimeStatusStore.subscribe(update);
    const tick = setInterval(update, 5000);
    return () => { unsub(); clearInterval(tick); };
  }, []);

  const sessionMinutes = Math.max(1, Math.round((Date.now() - telemetry.startedAt) / 60000));
  const errorRate = (telemetry.totalErrors / sessionMinutes).toFixed(2);
  const reconnectSuccess = telemetry.totalErrors > 0
    ? Math.round((telemetry.totalReconnects / telemetry.totalErrors) * 100)
    : 100;

  const overallMeta =
    status.overall === 'connected'
      ? { icon: CheckCircle2, color: 'text-emerald-500', label: 'Tutti i canali realtime sono operativi' }
      : status.overall === 'connecting'
        ? { icon: Loader2, color: 'text-muted-foreground animate-spin', label: 'Connessione in corso…' }
        : status.overall === 'degraded'
          ? { icon: AlertTriangle, color: 'text-amber-500', label: 'Alcuni canali stanno tentando la riconnessione' }
          : { icon: WifiOff, color: 'text-destructive', label: 'Connessione realtime persa' };

  const Icon = overallMeta.icon;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className={`h-5 w-5 ${overallMeta.color}`} />
            Stato connessione realtime
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{overallMeta.label}</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-muted/40">
              <div className="text-2xl font-semibold">{status.connectedChannels}/{status.totalChannels}</div>
              <div className="text-xs text-muted-foreground mt-1">Canali attivi</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40">
              <div className="text-2xl font-semibold">{status.failingChannels.length}</div>
              <div className="text-xs text-muted-foreground mt-1">In errore / retry</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40">
              <div className="text-2xl font-semibold">{status.maxRetryCount}</div>
              <div className="text-xs text-muted-foreground mt-1">Retry massimi</div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Forza riconnessione
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dettaglio canali</CardTitle>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun canale realtime attivo.</p>
          ) : (
            <div className="space-y-2">
              {channels
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, state]) => {
                  const meta = STATUS_META[state.status];
                  return (
                    <div
                      key={name}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-sm truncate">{name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          aggiornato {formatDistanceToNow(state.lastChangeAt, { locale: it, addSuffix: true })}
                          {state.lastError && ` · ${state.lastError}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {state.retryCount > 0 && (
                          <span className="text-xs text-muted-foreground">retry #{state.retryCount}</span>
                        )}
                        <Badge variant={meta.variant} className={meta.className}>
                          {meta.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
