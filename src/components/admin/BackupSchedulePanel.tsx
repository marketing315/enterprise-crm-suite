import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar, CloudUpload, Save, Loader2 } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import {
  useBackupSchedules,
  useUpsertBackupSchedule,
} from "@/hooks/useBackupSchedules";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const DAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

export function BackupSchedulePanel() {
  const { currentBrand } = useBrand();
  const { data: schedules = [], isLoading } = useBackupSchedules();
  const upsert = useUpsertBackupSchedule();

  const current = schedules.find((s) => s.brand_id === currentBrand?.id);

  const [enabled, setEnabled] = useState(false);
  const [scope, setScope] = useState<"minimal" | "standard" | "full">("standard");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [hourUtc, setHourUtc] = useState(3);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [retentionDays, setRetentionDays] = useState(30);

  useEffect(() => {
    if (current) {
      setEnabled(current.enabled);
      setScope(current.scope);
      setFrequency(current.frequency);
      setHourUtc(current.hour_utc);
      setDayOfWeek(current.day_of_week ?? 1);
      setRetentionDays(current.retention_days);
    }
  }, [current?.id]);

  if (!currentBrand?.id) {
    return (
      <Alert>
        <AlertTitle>Nessun brand selezionato</AlertTitle>
        <AlertDescription>Seleziona un brand per configurare la pianificazione.</AlertDescription>
      </Alert>
    );
  }

  const handleSave = () => {
    upsert.mutate({
      brand_id: currentBrand.id,
      scope,
      frequency,
      hour_utc: hourUtc,
      day_of_week: frequency === "weekly" ? dayOfWeek : null,
      retention_days: retentionDays,
      enabled,
    });
  };

  return (
    <div className="space-y-6">
      <Alert>
        <CloudUpload className="h-4 w-4" />
        <AlertTitle>Backup ricorrenti su Storage privato</AlertTitle>
        <AlertDescription>
          I backup pianificati vengono caricati nel bucket privato <code className="text-xs">backup-archives</code> e
          conservati per i giorni indicati. La pulizia degli archivi scaduti è automatica.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Pianificazione del brand
          </CardTitle>
          <CardDescription>
            Brand: <span className="font-medium text-foreground">{currentBrand.name}</span>
            {current && (
              <span className="ml-2 text-xs">
                · ultima esecuzione:{" "}
                {current.last_run_at
                  ? format(new Date(current.last_run_at), "d MMM yyyy HH:mm", { locale: it })
                  : "mai"}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="enabled" className="text-base font-medium">Abilitata</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Quando attiva, il sistema esegue i backup automaticamente all'orario indicato.
              </p>
            </div>
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimal">Minimal — entità core</SelectItem>
                  <SelectItem value="standard">Standard — + storia & audit</SelectItem>
                  <SelectItem value="full">Full — tutte le tabelle business</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Frequenza</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Giornaliera</SelectItem>
                  <SelectItem value="weekly">Settimanale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ora di esecuzione (UTC)</Label>
              <Select value={String(hourUtc)} onValueChange={(v) => setHourUtc(parseInt(v, 10))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, "0")}:00 UTC
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Equivalente locale (Italia): {String((hourUtc + 1) % 24).padStart(2, "0")}:00 (CET) /{" "}
                {String((hourUtc + 2) % 24).padStart(2, "0")}:00 (CEST)
              </p>
            </div>

            {frequency === "weekly" && (
              <div className="space-y-2">
                <Label>Giorno della settimana</Label>
                <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(parseInt(v, 10))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => (
                      <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Retention (giorni)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Math.min(365, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              />
              <p className="text-xs text-muted-foreground">
                Gli archivi più vecchi di questo limite vengono eliminati automaticamente.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              {current ? (
                <>Ultima modifica: {format(new Date(current.updated_at), "d MMM yyyy HH:mm", { locale: it })}</>
              ) : (
                <>Nessuna pianificazione ancora salvata.</>
              )}
              {current?.last_run_status && (
                <Badge variant={current.last_run_status === "completed" ? "secondary" : "destructive"} className="ml-2">
                  {current.last_run_status}
                </Badge>
              )}
            </div>
            <Button onClick={handleSave} disabled={upsert.isPending || isLoading}>
              {upsert.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvataggio…</>
              ) : (
                <><Save className="h-4 w-4 mr-2" />Salva pianificazione</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
