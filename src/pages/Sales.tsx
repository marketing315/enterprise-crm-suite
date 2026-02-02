import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { 
  ShoppingCart, 
  Plus, 
  Search,
  Filter,
  Euro,
  ShieldAlert
} from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSalesOrders, useSalesKpis } from "@/hooks/useSalesOrders";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SalesOrderDetailSheet } from "@/components/sales/SalesOrderDetailSheet";
import { ORDER_STATUS_CONFIG, type SalesOrderStatus } from "@/types/sales";
import { subDays, startOfDay, endOfDay } from "date-fns";

export default function Sales() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const { isAdmin, isCeo, hasRole } = useAuth();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Check permissions
  const canView = isAdmin || isCeo || 
    (currentBrand && (
      hasRole('responsabile_venditori', currentBrand.id) ||
      hasRole('venditore', currentBrand.id)
    ));

  // Date range for KPIs (last 30 days)
  const now = new Date();
  const from = startOfDay(subDays(now, 30));
  const to = endOfDay(now);

  const { data: orders = [], isLoading } = useSalesOrders({
    status: statusFilter !== "all" ? statusFilter as SalesOrderStatus : undefined,
  });

  const { data: kpis } = useSalesKpis(from, to);

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare le vendite.
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
            Non hai i permessi per visualizzare le vendite.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Filter orders by search
  const filteredOrders = orders.filter(order => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const contactName = `${order.contact?.first_name || ''} ${order.contact?.last_name || ''}`.toLowerCase();
    return (
      order.order_number.toLowerCase().includes(query) ||
      contactName.includes(query)
    );
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" />
            Vendite
          </h1>
          <p className="text-muted-foreground">
            Gestisci ordini e pagamenti
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fatturato (30gg)</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(kpis.total_revenue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ordini Totali</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.total_orders}</div>
              <p className="text-xs text-muted-foreground">
                {kpis.orders_paid} pagati, {kpis.orders_pending} in attesa
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valore Medio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(kpis.avg_order_value)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tasso Conversione</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.conversion_rate}%</div>
              <p className="text-xs text-muted-foreground">Ordini pagati / totali</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per numero ordine o cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {Object.entries(ORDER_STATUS_CONFIG).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N° Ordine</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Venditore</TableHead>
              <TableHead>Totale</TableHead>
              <TableHead>Pagato</TableHead>
              <TableHead>Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Caricamento...
                </TableCell>
              </TableRow>
            ) : filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nessuna vendita trovata
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => (
                <TableRow 
                  key={order.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <TableCell className="font-medium">{order.order_number}</TableCell>
                  <TableCell>
                    {format(new Date(order.created_at), "dd MMM yyyy", { locale: it })}
                  </TableCell>
                  <TableCell>
                    {order.contact?.first_name} {order.contact?.last_name}
                  </TableCell>
                  <TableCell>
                    {order.assigned_user?.full_name || 
                      <span className="text-muted-foreground">Non assegnato</span>
                    }
                  </TableCell>
                  <TableCell>{formatCurrency(order.total_amount)}</TableCell>
                  <TableCell>{formatCurrency(order.paid_amount)}</TableCell>
                  <TableCell>
                    <Badge className={ORDER_STATUS_CONFIG[order.status].color}>
                      {ORDER_STATUS_CONFIG[order.status].label}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Detail Sheet */}
      <SalesOrderDetailSheet
        orderId={selectedOrderId}
        open={!!selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      />
    </div>
  );
}
