import { useState } from "react";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { TrendingUp, Calendar, ShieldAlert } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSalespersonKpis } from "@/hooks/useSalespersonKpis";
import { SalespersonKpiCards } from "@/components/team/SalespersonKpiCards";
import { SalespersonTable } from "@/components/team/SalespersonTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PeriodOption = "7" | "30" | "90" | "365";

export default function SalespersonKpi() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const { isAdmin, isCeo, hasRole, userRoles } = useAuth();
  const [period, setPeriod] = useState<PeriodOption>("30");

  // Check if user can view this page
  // Allowed: admin, ceo, responsabile_venditori (for their brand)
  const canView = isAdmin || isCeo || 
    (currentBrand && hasRole('responsabile_venditori', currentBrand.id));

  const now = new Date();
  const from = startOfDay(subDays(now, parseInt(period)));
  const to = endOfDay(now);

  const { data: kpis = [], isLoading } = useSalespersonKpis({ from, to });

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare le performance dei venditori.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Accesso negato</AlertTitle>
          <AlertDescription>
            Non hai i permessi per visualizzare questa pagina. 
            Contatta un amministratore se ritieni di dover accedere.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Performance Venditori
          </h1>
          <p className="text-muted-foreground">
            KPI e statistiche del team vendite di {currentBrand?.name}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Ultimi 7 giorni</SelectItem>
              <SelectItem value="30">Ultimi 30 giorni</SelectItem>
              <SelectItem value="90">Ultimi 90 giorni</SelectItem>
              <SelectItem value="365">Ultimo anno</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <SalespersonKpiCards kpis={kpis} isLoading={isLoading} />

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Dettaglio Venditori</h2>
          <p className="text-sm text-muted-foreground">
            Performance individuale nel periodo selezionato
          </p>
        </div>
        <div className="p-4">
          <SalespersonTable kpis={kpis} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
