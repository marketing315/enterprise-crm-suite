import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Archive, Clock, Play, FlaskConical, Loader2 } from "lucide-react";
import {
  useAuditRetentionPolicies,
  useUpsertRetentionPolicy,
  useRunAuditRetention,
} from "@/hooks/useAuditRetention";
import { useBrandHierarchy } from "@/hooks/useBrandHierarchy";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export function AuditRetentionPanel() {
  const { data: policies = [], isLoading } = useAuditRetentionPolicies();
  const { data: brands = [] } = useBrandHierarchy();
  const upsert = useUpsertRetentionPolicy();
  const run = useRunAuditRetention();

  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [months, setMonths] = useState<number>(24);
  const [archive, setArchive] = useState<boolean>(true);

  const policiesByBrand = useMemo(() => {
    const map = new Map<string, (typeof policies)[number]>();
    policies.forEach((p) => map.set(p.brand_id, p));
    return map;
  }, [policies]);

  const brandsWithoutPolicy = useMemo(
    () => brands.filter((b) => !policiesByBrand.has(b.id)),
    [brands, policiesByBrand]
  );

  const handleSave = () => {
    if (!selectedBrand) return;
    upsert.mutate(
      { brand_id: selectedBrand, retention_months: months, archive_enabled: archive },
      {
        onSuccess: () => {
          setSelectedBrand("");
          setMonths(24);
          setArchive(true);
        },
      }
    );
  };

  const formatDate = (iso: string | null) =>
    iso ? format(new Date(iso), "dd MMM yyyy HH:mm", { locale: it }) : "—";

  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Configura retention per brand
          </CardTitle>
          <CardDescription>
            Imposta per quanti mesi conservare gli audit log di ogni brand. Gli eventi più
            vecchi vengono opzionalmente archiviati e poi rimossi dal log attivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Brand</Label>
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona brand" />
                </SelectTrigger>
                <SelectContent>
                  {brandsWithoutPolicy.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      Tutti i brand hanno una policy
                    </SelectItem>
                  ) : (
                    brandsWithoutPolicy.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mesi di conservazione</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={months}
                onChange={(e) => setMonths(Math.max(1, Math.min(120, Number(e.target.value) || 24)))}
              />
            </div>
            <div className="flex items-center gap-2 h-10">
              <Switch checked={archive} onCheckedChange={setArchive} id="archive-toggle" />
              <Label htmlFor="archive-toggle" className="text-sm cursor-pointer">
                Archivia prima di eliminare
              </Label>
            </div>
            <Button onClick={handleSave} disabled={!selectedBrand || upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Salva policy
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Archive className="h-4 w-4" />
              Policy attive
            </CardTitle>
            <CardDescription>
              {policies.length} brand configurati. Esegui il purge manualmente o via cron.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => run.mutate({ dry_run: true })}
              disabled={run.isPending || policies.length === 0}
            >
              {run.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
              )}
              Simula (dry-run)
            </Button>
            <Button
              size="sm"
              onClick={() => run.mutate({ dry_run: false })}
              disabled={run.isPending || policies.length === 0}
            >
              {run.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1.5" />
              )}
              Esegui ora
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Caricamento…</div>
          ) : policies.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nessuna policy configurata. Aggiungine una sopra.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Retention</TableHead>
                  <TableHead>Archivio</TableHead>
                  <TableHead>Ultimo purge</TableHead>
                  <TableHead className="text-right">Ultimi conteggi</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{brandName(p.brand_id)}</TableCell>
                    <TableCell>{p.retention_months} mesi</TableCell>
                    <TableCell>
                      {p.archive_enabled ? (
                        <Badge variant="secondary">Attivo</Badge>
                      ) : (
                        <Badge variant="outline">Disattivato</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(p.last_purge_at)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <span className="text-muted-foreground">arch.</span>{" "}
                      {p.last_archived_count ?? 0} ·{" "}
                      <span className="text-muted-foreground">rim.</span>{" "}
                      {p.last_purged_count ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => run.mutate({ brand_id: p.brand_id, dry_run: false })}
                        disabled={run.isPending}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Purge
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
