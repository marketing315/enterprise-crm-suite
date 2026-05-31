/**
 * AppointmentDoneFlow — wizard to record an "executed" appointment outcome,
 * optionally creating a sales order with items + payment + contracts.
 * Commit order documented in spec §7.
 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Package, X, ShoppingCart, FileSignature } from "lucide-react";
import { useRecordOutcome } from "./useRecordOutcome";
import { ProposedProductsPicker, type ProposedItem } from "./ProposedProductsPicker";
import { SaleDetailsForm, DEFAULT_SALE_DRAFT, type SaleDraft } from "@/features/sales/SaleDetailsForm";
import { useCreateSalesOrderFromAppointment } from "@/hooks/useCreateSalesOrderFromAppointment";
import { useAddOrderItem } from "@/hooks/useSalesOrderItems";
import { useRecordPayment } from "@/hooks/usePayments";
import { useUpdateSalesOrderStatus } from "@/hooks/useSalesOrders";
import type { TodayAppointment } from "./useTodayAppointments";
import { toast } from "sonner";

type Step = "confirm" | "ask_products" | "pick_products" | "sold_or_not" | "notes_only" | "sale_form";

interface Props {
  appointment: TodayAppointment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

export function AppointmentDoneFlow({ appointment, open, onOpenChange, onCompleted }: Props) {
  const contactName = `${appointment.contact?.first_name ?? ""} ${appointment.contact?.last_name ?? ""}`.trim() || "cliente";
  const draftOrderId = useMemo(() => crypto.randomUUID(), [appointment.id, open]);

  const [step, setStep] = useState<Step>("confirm");
  const [items, setItems] = useState<ProposedItem[]>([]);
  const [sold, setSold] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");
  const [sale, setSale] = useState<SaleDraft>(() =>
    DEFAULT_SALE_DRAFT({
      first_name: appointment.contact?.first_name ?? "",
      last_name: appointment.contact?.last_name ?? "",
      email: appointment.contact?.email ?? "",
      phone: appointment.contact?.phone ?? "",
    })
  );
  const [submitting, setSubmitting] = useState(false);

  const recordOutcome = useRecordOutcome();
  const createOrder = useCreateSalesOrderFromAppointment();
  const addItem = useAddOrderItem();
  const recordPayment = useRecordPayment();
  const updateOrderStatus = useUpdateSalesOrderStatus();

  const reset = () => {
    setStep("confirm");
    setItems([]);
    setSold(null);
    setNotes("");
  };

  const close = (next: boolean) => {
    if (!next && !submitting) reset();
    if (!submitting) onOpenChange(next);
  };

  // ---- Commit handlers ------------------------------------------------------

  const commitNotesOnly = async (proposed: boolean) => {
    setSubmitting(true);
    try {
      await recordOutcome.mutateAsync({
        appointmentId: appointment.id,
        outcomeCode: "executed",
        outcomeNotes: notes.trim() || null,
        metadata: {
          proposed,
          sold: false,
          reason: notes.trim() || null,
          proposed_items: items.map((it) => ({
            product_id: it.product_id,
            proposed_price: it.proposed_price,
          })),
        },
      });
      onOpenChange(false);
      reset();
      onCompleted?.();
    } catch {
      /* toast handled */
    } finally {
      setSubmitting(false);
    }
  };

  const commitSale = async () => {
    if (!appointment.contact?.id) {
      toast.error("Contatto mancante sull'appuntamento");
      return;
    }
    // Validation
    if (items.length === 0 || items.some((i) => !(i.proposed_price > 0))) {
      toast.error("Verifica prezzi prodotti");
      return;
    }
    if (sale.mode === "deposit_financing" && sale.contract_paths.length === 0) {
      toast.error("Carica almeno un contratto per il finanziamento");
      return;
    }

    setSubmitting(true);
    let orderId: string | null = null;
    try {
      // 1. Sales order
      orderId = await createOrder.mutateAsync({
        appointmentId: appointment.id,
        contactId: appointment.contact.id,
        dealId: appointment.deal_id,
      });

      // 2. Items
      for (const it of items) {
        await addItem.mutateAsync({
          orderId,
          item: {
            product_id: it.product_id,
            name: it.name,
            quantity: 1,
            unit_price: it.proposed_price,
            vat_rate: it.vat_rate ?? 22,
          },
        });
      }

      const total = items.reduce((s, it) => s + Number(it.proposed_price || 0), 0);
      const deposit = Number(sale.deposit_amount || 0);

      // 3. Payment
      if (sale.mode === "paid_delivered") {
        await recordPayment.mutateAsync({
          order_id: orderId,
          amount: total,
          method: sale.paid_method,
          notes: sale.contract_paths.length
            ? `contracts:${sale.contract_paths.join("|")}`
            : null,
        });
        await updateOrderStatus.mutateAsync({ orderId, status: "paid" });
      } else if (sale.mode === "deposit_balance") {
        if (deposit > 0) {
          await recordPayment.mutateAsync({
            order_id: orderId,
            amount: deposit,
            method: sale.paid_method,
            notes: sale.contract_paths.length
              ? `deposit;contracts:${sale.contract_paths.join("|")}`
              : "deposit",
          });
          await updateOrderStatus.mutateAsync({ orderId, status: "partially_paid" });
        }
      } else if (sale.mode === "deposit_financing") {
        await recordPayment.mutateAsync({
          order_id: orderId,
          amount: deposit,
          method: "installment",
          notes: "deposit+financing",
          plan_details: {
            num_installments: sale.installments.num_installments,
            installment_amount: sale.installments.installment_amount,
            first_due_date: sale.installments.first_due_date,
            // contract_paths kept here per spec §6
            ...({ contract_paths: sale.contract_paths } as Record<string, unknown>),
          } as any,
        });
        if (deposit > 0) {
          await updateOrderStatus.mutateAsync({ orderId, status: "partially_paid" });
        }
      }

      // 4. Outcome (last)
      await recordOutcome.mutateAsync({
        appointmentId: appointment.id,
        outcomeCode: "executed",
        outcomeNotes: null,
        metadata: {
          proposed: true,
          sold: true,
          sales_order_id: orderId,
          proposed_items: items.map((it) => ({
            product_id: it.product_id,
            proposed_price: it.proposed_price,
          })),
          payment_mode: sale.mode,
          contract_paths: sale.contract_paths,
        },
      });

      onOpenChange(false);
      reset();
      onCompleted?.();
    } catch (err: any) {
      toast.error(err?.message || "Errore nel salvataggio della vendita");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Render --------------------------------------------------------------

  const back = (to: Step) => (
    <Button variant="ghost" size="sm" onClick={() => setStep(to)} disabled={submitting}>
      <ChevronLeft className="h-4 w-4 mr-1" /> Indietro
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Appuntamento svolto</DialogTitle>
          <DialogDescription>
            Con <span className="font-medium">{contactName}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Step 0 */}
        {step === "confirm" && (
          <div className="py-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Confermi di aver svolto l'appuntamento con <span className="font-medium">{contactName}</span>?
            </p>
            <DialogFooter className="!justify-center gap-2">
              <Button variant="ghost" onClick={() => close(false)}>Annulla</Button>
              <Button onClick={() => setStep("ask_products")}>Continua</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 1 */}
        {step === "ask_products" && (
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">Hai proposto dei prodotti?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-auto py-6 flex-col gap-2"
                onClick={() => { setItems([]); setStep("notes_only"); }}
              >
                <X className="h-5 w-5" />
                <span>Nessun prodotto proposto</span>
              </Button>
              <Button
                className="h-auto py-6 flex-col gap-2"
                onClick={() => setStep("pick_products")}
              >
                <Package className="h-5 w-5" />
                <span>Seleziona prodotto</span>
              </Button>
            </div>
            <DialogFooter className="!justify-between">
              {back("confirm")}
              <span />
            </DialogFooter>
          </div>
        )}

        {/* Step 2 */}
        {step === "pick_products" && (
          <div className="py-2 space-y-4">
            <ProposedProductsPicker value={items} onChange={setItems} />
            <DialogFooter className="!justify-between">
              {back("ask_products")}
              <Button
                onClick={() => setStep("sold_or_not")}
                disabled={items.length === 0 || items.some((i) => !(i.proposed_price > 0))}
              >
                Conferma proposta
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3 */}
        {step === "sold_or_not" && (
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">Esito della proposta?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-auto py-6 flex-col gap-2"
                onClick={() => { setSold(false); setStep("notes_only"); }}
              >
                <X className="h-5 w-5" />
                <span>Non venduto</span>
              </Button>
              <Button
                className="h-auto py-6 flex-col gap-2"
                onClick={() => { setSold(true); setStep("sale_form"); }}
              >
                <ShoppingCart className="h-5 w-5" />
                <span>Venduto</span>
              </Button>
            </div>
            <DialogFooter className="!justify-between">
              {back("pick_products")}
              <span />
            </DialogFooter>
          </div>
        )}

        {/* Step 4 — notes only (no sale) */}
        {step === "notes_only" && (
          <div className="py-2 space-y-3">
            <Label htmlFor="not-sold-notes">
              Note esito {sold === false && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="not-sold-notes"
              rows={4}
              placeholder={
                sold === false
                  ? "Perché non è stato venduto?"
                  : "Eventuali note sull'appuntamento (facoltativo)"
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <DialogFooter className="!justify-between">
              {back(items.length > 0 ? "sold_or_not" : "ask_products")}
              <Button
                onClick={() => commitNotesOnly(items.length > 0)}
                disabled={submitting || (sold === false && notes.trim().length === 0)}
              >
                {submitting ? "Salvataggio…" : "Salva"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 5 — sale form */}
        {step === "sale_form" && (
          <div className="py-2 space-y-4">
            <SaleDetailsForm
              items={items}
              draftOrderId={draftOrderId}
              value={sale}
              onChange={setSale}
            />
            <DialogFooter className="!justify-between">
              {back("sold_or_not")}
              <Button onClick={commitSale} disabled={submitting}>
                <FileSignature className="h-4 w-4 mr-2" />
                {submitting ? "Salvataggio…" : "Conferma vendita"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
