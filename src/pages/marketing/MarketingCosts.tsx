import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertCircle, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useHasMarketingAccess, useCanEditMarketingCosts } from "@/hooks/useMarketingAccess";
import { useMarketingCosts, useDeleteMarketingCost } from "@/hooks/useMarketingCosts";
import { CostFormDrawer } from "@/components/marketing/CostFormDrawer";
import { toast } from "sonner";
import type { MarketingCost } from "@/types/marketing";

export default function MarketingCosts() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasAccess = useHasMarketingAccess();
  const canEdit = useCanEditMarketingCosts();
  
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCost, setSelectedCost] = useState<MarketingCost | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: costs, isLoading } = useMarketingCosts({
    fromDate,
    toDate,
  });

  const deleteCost = useDeleteMarketingCost();

  const handleEdit = (cost: MarketingCost) => {
    setSelectedCost(cost);
    setDrawerOpen(true);
  };

  const handleCreate = () => {
    setSelectedCost(null);
    setDrawerOpen(true);
  };

  const handleDelete = async (cost: MarketingCost) => {
    if (!confirm("Eliminare questo costo?")) return;
    try {
      await deleteCost.mutateAsync(cost.id);
      toast.success("Costo eliminato");
    } catch {
      toast.error("Errore nell'eliminazione");
    }
  };

  const totalCosts = costs?.reduce((sum, c) => sum + c.amount, 0) || 0;

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Non hai i permessi per accedere a questa sezione.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Costi Marketing</h1>
          <p className="text-muted-foreground">
            Gestisci i costi marketing per {currentBrand?.name}
          </p>
        </div>

        {canEdit && (
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Costo
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-sm font-medium">Da</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <label className="text-sm font-medium">A</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="ml-auto text-right">
              <div className="text-sm text-muted-foreground">Totale periodo</div>
              <div className="text-2xl font-bold">
                €{totalCosts.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Costs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista Costi</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
          ) : !costs?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun costo registrato nel periodo selezionato.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Campagna</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead>Note</TableHead>
                    {canEdit && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.map((cost) => (
                    <TableRow key={cost.id}>
                      <TableCell>
                        {format(new Date(cost.cost_date), "dd/MM/yyyy", { locale: it })}
                      </TableCell>
                      <TableCell>
                        {cost.marketing_campaigns?.name || "—"}
                      </TableCell>
                      <TableCell className="capitalize">
                        {cost.source?.replace("_", " ") || "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        €{cost.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {cost.notes || "—"}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(cost)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Modifica
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(cost)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Elimina
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CostFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        cost={selectedCost}
      />
    </div>
  );
}
