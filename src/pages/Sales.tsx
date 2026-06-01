import { useState, useMemo } from "react";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { 
  ShoppingCart, 
  Plus, 
  Search,
  Filter,
  Euro,
  ShieldAlert,
  Sparkles,
  Calendar,
  User
} from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSalesOrders, useSalesKpis } from "@/hooks/useSalesOrders";
import { useRevenueByPaymentMethod } from "@/hooks/usePayments";
import { useTeamMembers } from "@/hooks/useTeam";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { SalesOrderDetailSheet } from "@/components/sales/SalesOrderDetailSheet";
import { QuickSaleDialog } from "@/components/sales/QuickSaleDialog";
import { ORDER_STATUS_CONFIG, PAYMENT_METHOD_LABELS, type SalesOrderStatus } from "@/types/sales";
import { cn } from "@/lib/utils";

type DatePreset = "all" | "today" | "week" | "month" | "custom";

import { useIsMobile } from "@/hooks/use-mobile";
import { MobileSales } from "@/components/sales/mobile/MobileSales";

export default function Sales() {
  const isMobileViewport = useIsMobile();
  if (isMobileViewport) return <MobileSales />;
  return <SalesDesktop />;
}

function SalesDesktop() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const { isAdmin, isCeo, hasRole } = useAuth();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [customDateRange, setCustomDateRange] = useState<{from?: Date, to?: Date}>({});

  // Fetch team members (venditori) for filter
  const { data: teamMembers = [] } = useTeamMembers("venditore", true);

  // Check permissions
  const canView = isAdmin || isCeo || 
    (currentBrand && (
      hasRole('responsabile_venditori', currentBrand.id) ||
      hasRole('venditore', currentBrand.id)
    ));

  // Calculate date range based on preset
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
      case "today":
        return { from: startOfDay(now), to: endOfDay(now) };
      case "week":
        return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
      case "month":
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case "custom":
        return { 
          from: customDateRange.from ? startOfDay(customDateRange.from) : undefined, 
          to: customDateRange.to ? endOfDay(customDateRange.to) : undefined 
        };
      default: // "all"
        return { from: undefined, to: undefined };
    }
  }, [datePreset, customDateRange]);

  // Date range for KPIs (last 30 days)
  const now = new Date();
  const kpiFrom = startOfDay(subDays(now, 30));
  const kpiTo = endOfDay(now);

  const { data: orders = [], isLoading, refetch } = useSalesOrders({
    status: statusFilter !== "all" ? statusFilter as SalesOrderStatus : undefined,
    assignedUserId: sellerFilter !== "all" ? sellerFilter : undefined,
    from: dateRange.from,
    to: dateRange.to,
  });

  const { data: kpis } = useSalesKpis(kpiFrom, kpiTo);
  const { data: revenueByMethod = [] } = useRevenueByPaymentMethod(kpiFrom, kpiTo);
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
        <Button onClick={() => setQuickSaleOpen(true)} className="gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Vendita rapida</span>
          <Plus className="h-4 w-4 sm:hidden" />
        </Button>
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

      {/* Revenue by Payment Method */}
      {revenueByMethod.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Ricavi per metodo di pagamento (30gg)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {revenueByMethod.map((item) => (
                <div
                  key={item.method}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {PAYMENT_METHOD_LABELS[item.method as keyof typeof PAYMENT_METHOD_LABELS] || item.method}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.order_count} ordini</p>
                  </div>
                  <p className="text-sm font-bold">{formatCurrency(item.total_revenue)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per numero ordine o cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Seller Filter */}
        <Select value={sellerFilter} onValueChange={setSellerFilter}>
          <SelectTrigger className="w-[180px]">
            <User className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Venditore" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i venditori</SelectItem>
            {teamMembers.map((member) => (
              <SelectItem key={member.user_id} value={member.user_id}>
                {member.full_name || member.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
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

        {/* Date Preset Filter */}
        <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
          <SelectTrigger className="w-[160px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Periodo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le date</SelectItem>
            <SelectItem value="today">Oggi</SelectItem>
            <SelectItem value="week">Ultimi 7 giorni</SelectItem>
            <SelectItem value="month">Questo mese</SelectItem>
            <SelectItem value="custom">Personalizzato</SelectItem>
          </SelectContent>
        </Select>

        {/* Custom Date Range Picker */}
        {datePreset === "custom" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[240px] justify-start text-left font-normal", !customDateRange.from && "text-muted-foreground")}>
                <Calendar className="mr-2 h-4 w-4" />
                {customDateRange.from ? (
                  customDateRange.to ? (
                    <>
                      {format(customDateRange.from, "dd/MM/yy", { locale: it })} - {format(customDateRange.to, "dd/MM/yy", { locale: it })}
                    </>
                  ) : (
                    format(customDateRange.from, "dd/MM/yyyy", { locale: it })
                  )
                ) : (
                  <span>Seleziona date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                initialFocus
                mode="range"
                defaultMonth={customDateRange.from}
                selected={{ from: customDateRange.from, to: customDateRange.to }}
                onSelect={(range) => setCustomDateRange({ from: range?.from, to: range?.to })}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        )}
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

      {/* Quick Sale Dialog */}
      <QuickSaleDialog
        open={quickSaleOpen}
        onOpenChange={setQuickSaleOpen}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
