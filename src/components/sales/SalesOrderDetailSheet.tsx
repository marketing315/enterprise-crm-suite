import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { 
  X, 
  Plus, 
  Trash2, 
  CreditCard,
  FileText,
  User,
  Building2,
  Clock,
  Euro,
  Check,
  Ban
} from "lucide-react";
import { useSalesOrder, useUpdateSalesOrderStatus } from "@/hooks/useSalesOrders";
import { useSalesOrderItems, useAddOrderItem, useDeleteOrderItem } from "@/hooks/useSalesOrderItems";
import { useOrderPayments, useRecordPayment } from "@/hooks/usePayments";
import { useProducts } from "@/hooks/useProducts";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ORDER_STATUS_CONFIG, 
  PAYMENT_METHOD_LABELS,
  type PaymentMethod 
} from "@/types/sales";

interface SalesOrderDetailSheetProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SalesOrderDetailSheet({ orderId, open, onOpenChange }: SalesOrderDetailSheetProps) {
  const { isAdmin, isCeo, hasRole } = useAuth();
  const { currentBrand } = useBrand();
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  // Item form
  const [itemForm, setItemForm] = useState({
    product_id: "",
    name: "",
    quantity: "1",
    unit_price: "",
  });

  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "bank_transfer" as PaymentMethod,
    reference: "",
  });

  const { data: order, isLoading } = useSalesOrder(orderId);
  const { data: items = [] } = useSalesOrderItems(orderId);
  const { data: payments = [] } = useOrderPayments(orderId);
  const { data: products = [] } = useProducts();

  const updateStatus = useUpdateSalesOrderStatus();
  const addItem = useAddOrderItem();
  const deleteItem = useDeleteOrderItem();
  const recordPayment = useRecordPayment();

  // Check if user can edit this order
  const canEdit = isAdmin || isCeo || 
    (currentBrand && hasRole('responsabile_venditori', currentBrand.id)) ||
    (currentBrand && hasRole('venditore', currentBrand.id) && order?.assigned_user_id === order?.assigned_user?.id);

  const canManageStatus = isAdmin || isCeo || 
    (currentBrand && hasRole('responsabile_venditori', currentBrand.id));

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const handleAddItem = async () => {
    if (!orderId) return;

    await addItem.mutateAsync({
      orderId,
      item: {
        product_id: itemForm.product_id || undefined,
        name: itemForm.name,
        quantity: parseFloat(itemForm.quantity) || 1,
        unit_price: parseFloat(itemForm.unit_price) || 0,
      },
    });

    setAddItemDialogOpen(false);
    setItemForm({ product_id: "", name: "", quantity: "1", unit_price: "" });
  };

  const handleRecordPayment = async () => {
    if (!orderId) return;

    await recordPayment.mutateAsync({
      order_id: orderId,
      amount: parseFloat(paymentForm.amount) || 0,
      method: paymentForm.method,
      reference: paymentForm.reference || undefined,
    });

    setPaymentDialogOpen(false);
    setPaymentForm({ amount: "", method: "bank_transfer", reference: "" });
  };

  const handleProductSelect = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setItemForm({
        product_id: productId,
        name: product.name,
        quantity: "1",
        unit_price: product.default_price.toString(),
      });
    }
  };

  if (!order && !isLoading) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader className="flex flex-row items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {order?.order_number || "Caricamento..."}
              </SheetTitle>
              {order && (
                <Badge className={ORDER_STATUS_CONFIG[order.status].color}>
                  {ORDER_STATUS_CONFIG[order.status].label}
                </Badge>
              )}
            </div>
          </SheetHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-muted-foreground">Caricamento...</span>
            </div>
          ) : order && (
            <ScrollArea className="h-[calc(100vh-120px)] mt-4">
              <div className="space-y-6 pr-4">
                {/* Contact & Salesperson */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Cliente
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium">
                        {order.contact?.first_name} {order.contact?.last_name}
                      </p>
                      {order.contact?.email && (
                        <p className="text-sm text-muted-foreground">{order.contact.email}</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Venditore
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium">
                        {order.assigned_user?.full_name || "Non assegnato"}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Order Items */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm">Prodotti</CardTitle>
                    {canEdit && order.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => setAddItemDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Aggiungi
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nessun prodotto aggiunto
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex-1">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.quantity} x {formatCurrency(item.unit_price)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{formatCurrency(item.line_total)}</span>
                              {canEdit && order.status === "draft" && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() = aria-label="Elimina"> deleteItem.mutate({ itemId: item.id, orderId: order.id })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Totals */}
                <Card>
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Subtotale</span>
                        <span>{formatCurrency(order.subtotal)}</span>
                      </div>
                      {order.discount_amount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Sconto</span>
                          <span>-{formatCurrency(order.discount_amount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span>IVA</span>
                        <span>{formatCurrency(order.tax_amount)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Totale</span>
                        <span>{formatCurrency(order.total_amount)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Pagato</span>
                        <span className={order.paid_amount >= order.total_amount ? "text-green-600" : ""}>
                          {formatCurrency(order.paid_amount)}
                        </span>
                      </div>
                      {order.total_amount - order.paid_amount > 0 && (
                        <div className="flex justify-between text-sm text-orange-600">
                          <span>Da pagare</span>
                          <span>{formatCurrency(order.total_amount - order.paid_amount)}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Payments */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Pagamenti
                    </CardTitle>
                    {canEdit && order.status !== "cancelled" && order.status !== "refunded" && order.paid_amount < order.total_amount && (
                      <Button size="sm" variant="outline" onClick={() => setPaymentDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Registra
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {payments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nessun pagamento registrato
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {payments.map((payment) => (
                          <div key={payment.id} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div>
                              <p className="font-medium">{formatCurrency(payment.amount)}</p>
                              <p className="text-sm text-muted-foreground">
                                {PAYMENT_METHOD_LABELS[payment.method]}
                                {payment.reference && ` - ${payment.reference}`}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">
                                {payment.paid_at && format(new Date(payment.paid_at), "dd/MM/yyyy", { locale: it })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Timeline */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Creato</span>
                        <span>{format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: it })}</span>
                      </div>
                      {order.confirmed_at && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Confermato</span>
                          <span>{format(new Date(order.confirmed_at), "dd/MM/yyyy HH:mm", { locale: it })}</span>
                        </div>
                      )}
                      {order.paid_at && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pagato</span>
                          <span>{format(new Date(order.paid_at), "dd/MM/yyyy HH:mm", { locale: it })}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                {canManageStatus && (
                  <div className="flex flex-wrap gap-2">
                    {order.status === "draft" && items.length > 0 && (
                      <Button
                        onClick={() => updateStatus.mutate({ orderId: order.id, status: "confirmed" })}
                        disabled={updateStatus.isPending}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Conferma ordine
                      </Button>
                    )}
                    {order.status !== "cancelled" && order.status !== "paid" && order.status !== "refunded" && (
                      <Button
                        variant="destructive"
                        onClick={() => updateStatus.mutate({ orderId: order.id, status: "cancelled" })}
                        disabled={updateStatus.isPending}
                      >
                        <Ban className="h-4 w-4 mr-2" />
                        Annulla
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Item Dialog */}
      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi prodotto</DialogTitle>
            <DialogDescription>
              Seleziona un prodotto dal catalogo o inserisci manualmente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Prodotto dal catalogo</Label>
              <Select value={itemForm.product_id} onValueChange={handleProductSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona prodotto..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} - {formatCurrency(product.default_price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="item_name">Nome *</Label>
              <Input
                id="item_name"
                value={itemForm.name}
                onChange={(e) => setItemForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nome prodotto/servizio"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item_qty">Quantità</Label>
                <Input
                  id="item_qty"
                  type="number"
                  min="1"
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm(prev => ({ ...prev, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item_price">Prezzo unitario (€)</Label>
                <Input
                  id="item_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemForm.unit_price}
                  onChange={(e) => setItemForm(prev => ({ ...prev, unit_price: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemDialogOpen(false)}>
              Annulla
            </Button>
            <Button 
              onClick={handleAddItem}
              disabled={!itemForm.name || !itemForm.unit_price || addItem.isPending}
            >
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registra pagamento</DialogTitle>
            <DialogDescription>
              {order && `Da pagare: ${formatCurrency(order.total_amount - order.paid_amount)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payment_amount">Importo (€) *</Label>
              <Input
                id="payment_amount"
                type="number"
                step="0.01"
                min="0"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder={order ? (order.total_amount - order.paid_amount).toString() : ""}
              />
            </div>
            <div className="space-y-2">
              <Label>Metodo di pagamento</Label>
              <Select 
                value={paymentForm.method} 
                onValueChange={(v) => setPaymentForm(prev => ({ ...prev, method: v as PaymentMethod }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_ref">Riferimento (opzionale)</Label>
              <Input
                id="payment_ref"
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, reference: e.target.value }))}
                placeholder="N° bonifico, transazione, ecc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Annulla
            </Button>
            <Button 
              onClick={handleRecordPayment}
              disabled={!paymentForm.amount || recordPayment.isPending}
            >
              Registra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
