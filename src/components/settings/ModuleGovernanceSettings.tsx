import { useState } from "react";
import {
  useFeatureFlags,
  useUpdateFeatureFlag,
  useModuleAdoptionStats,
  type ModuleStatus,
  type FeatureFlag,
} from "@/hooks/useFeatureFlags";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Layers,
  BarChart3,
  Users,
  Calendar,
  Activity,
  Snowflake,
  Play,
  Search,
  XCircle,
  Wrench,
} from "lucide-react";

const STATUS_OPTIONS: { value: ModuleStatus; label: string; icon: typeof Play }[] = [
  { value: "active", label: "Attivo", icon: Play },
  { value: "maintain", label: "Manutenzione", icon: Wrench },
  { value: "evaluate", label: "In valutazione", icon: Search },
  { value: "frozen", label: "Sospeso", icon: Snowflake },
  { value: "sunset", label: "Dismesso", icon: XCircle },
];

const STATUS_VARIANT: Record<ModuleStatus, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  maintain: "outline",
  evaluate: "secondary",
  frozen: "destructive",
  sunset: "destructive",
};

const PERIOD_OPTIONS = [
  { value: 7, label: "7g" },
  { value: 30, label: "30g" },
  { value: 90, label: "90g" },
];

export function ModuleGovernanceSettings() {
  const [adoptionPeriod, setAdoptionPeriod] = useState(30);
  const { data: flags = [], isLoading: loadingFlags } = useFeatureFlags();
  const { data: adoption = [], isLoading: loadingAdoption } = useModuleAdoptionStats(adoptionPeriod);
  const updateFlag = useUpdateFeatureFlag();

  const handleStatusChange = (flag: FeatureFlag, newStatus: ModuleStatus) => {
    updateFlag.mutate(
      { id: flag.id, status: newStatus },
      {
        onSuccess: () => toast.success(`${flag.module_label} → ${newStatus}`),
        onError: (err) => toast.error(`Errore: ${err.message}`),
      }
    );
  };

  // Merge flags with adoption stats
  const mergedData = flags.map((flag) => {
    const stats = adoption.find((a) => a.module_key === flag.module_key);
    return { ...flag, stats };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Governance Moduli
          </CardTitle>
          <CardDescription>
            Gestisci lo stato dei moduli Nice-to-Have. I moduli "Sospesi" mostrano un fallback UX. I moduli "In valutazione" registrano la telemetria d'uso per decisioni QBR trimestrali.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Module Status Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Stato e adozione moduli
          </CardTitle>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((p) => (
              <Button
                key={p.value}
                variant={adoptionPeriod === p.value ? "default" : "outline"}
                size="sm"
                onClick={() => setAdoptionPeriod(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loadingFlags ? (
            <Skeleton className="h-64 w-full" />
          ) : mergedData.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nessun modulo configurato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modulo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      <BarChart3 className="h-3.5 w-3.5" /> Eventi
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      <Users className="h-3.5 w-3.5" /> Utenti
                    </span>
                  </TableHead>
                  <TableHead className="text-right">Media/g</TableHead>
                  <TableHead>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> Ultimo uso
                    </span>
                  </TableHead>
                  <TableHead>Azione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mergedData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.module_label}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[item.status]}>
                        {STATUS_OPTIONS.find((o) => o.value === item.status)?.label ?? item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {loadingAdoption ? "…" : item.stats?.total_events ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {loadingAdoption ? "…" : item.stats?.unique_users ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {loadingAdoption ? "…" : item.stats?.avg_daily ?? 0}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.stats?.last_used
                        ? format(new Date(item.stats.last_used), "dd MMM HH:mm", { locale: it })
                        : "Mai"}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.status}
                        onValueChange={(v) => handleStatusChange(item, v as ModuleStatus)}
                        disabled={updateFlag.isPending}
                      >
                        <SelectTrigger className="w-[140px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Decision Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Regola decisionale trimestrale (QBR)</CardTitle>
          <CardDescription>
            Criteri per promozione/retrocessione moduli durante la review trimestrale
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
              <div className="font-medium text-green-700 dark:text-green-400 mb-1">✅ Keep / Promote</div>
              <p className="text-sm text-muted-foreground">
                Media &gt;5 eventi/giorno <strong>e</strong> &gt;3 utenti unici nel periodo
              </p>
            </div>
            <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
              <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">⏸️ Freeze</div>
              <p className="text-sm text-muted-foreground">
                Media &lt;2 eventi/giorno <strong>o</strong> &lt;2 utenti unici
              </p>
            </div>
            <div className="p-3 rounded-lg border bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
              <div className="font-medium text-red-700 dark:text-red-400 mb-1">🌅 Sunset</div>
              <p className="text-sm text-muted-foreground">
                Zero eventi per 2 trimestri consecutivi → rimozione pianificata
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
