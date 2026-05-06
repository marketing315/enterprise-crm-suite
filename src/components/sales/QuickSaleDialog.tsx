import { useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { Camera, Upload, Loader2, Check, AlertCircle, Euro, Calendar, User, FileText, X, Sparkles } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/types/sales";
import { z } from "zod";

// ─── Zod schemas for plan details ───
const installmentSchema = z.object({
  num_installments: z.number().int().min(2, "Minimo 2 rate"),
  installment_amount: z.number().positive("Importo rata obbligatorio"),
  first_due_date: z.string().optional(),
  frequency_months: z.number().int().min(1).default(1),
});

const rentalSchema = z.object({
  monthly_fee: z.number().positive("Canone mensile obbligatorio"),
  duration_months: z.number().int().min(1, "Durata minima 1 mese"),
  start_date: z.string().min(1, "Data inizio obbligatoria"),
  end_date: z.string().optional(),
  auto_renew: z.boolean().default(false),
});

interface QuickSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ParsedSaleData {
  amount: number | null;
  date: string | null;
  customer_name: string | null;
  items: Array<{ name: string; quantity: number; unit_price: number }>;
  payment_method: string | null;
  notes: string | null;
  confidence: number;
  // H14: raw_text rimosso. Solo campi tipizzati.
}

type Step = "upload" | "review" | "saving";

export function QuickSaleDialog({ open, onOpenChange, onSuccess }: QuickSaleDialogProps) {
  const { currentBrand } = useBrand();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // H8 — guardia double-submit (ref vince sui re-render rapidi tra click)
  const submitInFlightRef = useRef(false);

  const [step, setStep] = useState<Step>("upload");
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedSaleData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [planErrors, setPlanErrors] = useState<string[]>([]);

  // Editable form fields
  const [formData, setFormData] = useState({
    amount: "",
    date: format(new Date(), "yyyy-MM-dd"),
    customer_name: "",
    payment_method: "cash" as PaymentMethod,
    notes: "",
  });

  // Installment fields
  const [installmentData, setInstallmentData] = useState({
    num_installments: "12",
    installment_amount: "",
    first_due_date: format(new Date(), "yyyy-MM-dd"),
    frequency_months: "1",
  });

  // Rental fields
  const [rentalData, setRentalData] = useState({
    monthly_fee: "",
    duration_months: "12",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: "",
    auto_renew: false,
  });

  const resetDialog = useCallback(() => {
    setStep("upload");
    setIsProcessing(false);
    setPreviewUrl(null);
    setParsedData(null);
    setPlanErrors([]);
    setFormData({
      amount: "",
      date: format(new Date(), "yyyy-MM-dd"),
      customer_name: "",
      payment_method: "cash",
      notes: "",
    });
    setInstallmentData({
      num_installments: "12",
      installment_amount: "",
      first_due_date: format(new Date(), "yyyy-MM-dd"),
      frequency_months: "1",
    });
    setRentalData({
      monthly_fee: "",
      duration_months: "12",
      start_date: format(new Date(), "yyyy-MM-dd"),
      end_date: "",
      auto_renew: false,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleClose = () => {
    resetDialog();
    onOpenChange(false);
  };

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Seleziona un'immagine valida");
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const base64 = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onloadend = () => {
          const result = r.result as string;
          resolve(result.split(",")[1]);
        };
        r.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("parse-sale-document", {
        body: { image_base64: base64 },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const parsed = data.data as ParsedSaleData;
        setParsedData(parsed);
        setFormData({
          amount: parsed.amount?.toString() || "",
          date: parsed.date || format(new Date(), "yyyy-MM-dd"),
          customer_name: parsed.customer_name || "",
          payment_method: mapPaymentMethod(parsed.payment_method) || "cash",
          notes: parsed.items?.length > 0
            ? parsed.items.map((i) => `${i.quantity}x ${i.name} @ €${i.unit_price}`).join("\n")
            : parsed.notes || "",
        });
        setStep("review");
        toast.success("Documento analizzato con successo!");
      } else {
        throw new Error("Parsing failed");
      }
    } catch (error) {
      console.error("Error parsing document:", error);
      toast.error("Errore nell'analisi del documento. Inserisci i dati manualmente.");
      setStep("review");
    } finally {
      setIsProcessing(false);
    }
  };

  const mapPaymentMethod = (method: string | null): PaymentMethod | null => {
    if (!method) return null;
    const lower = method.toLowerCase();
    if (lower.includes("contant") || lower.includes("cash")) return "cash";
    if (lower.includes("carta") || lower.includes("card") || lower.includes("pos")) return "card";
    if (lower.includes("bonific") || lower.includes("transfer")) return "bank_transfer";
    if (lower.includes("rat")) return "installment";
    if (lower.includes("noleggi") || lower.includes("rental")) return "rental";
    if (lower.includes("stripe")) return "stripe";
    return "other";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const validatePlanDetails = (): Record<string, unknown> | null => {
    setPlanErrors([]);

    if (formData.payment_method === "installment") {
      const result = installmentSchema.safeParse({
        num_installments: parseInt(installmentData.num_installments) || 0,
        installment_amount: parseFloat(installmentData.installment_amount) || 0,
        first_due_date: installmentData.first_due_date || undefined,
        frequency_months: parseInt(installmentData.frequency_months) || 1,
      });
      if (!result.success) {
        setPlanErrors(result.error.issues.map((i) => i.message));
        return null;
      }
      return result.data;
    }

    if (formData.payment_method === "rental") {
      const result = rentalSchema.safeParse({
        monthly_fee: parseFloat(rentalData.monthly_fee) || 0,
        duration_months: parseInt(rentalData.duration_months) || 0,
        start_date: rentalData.start_date,
        end_date: rentalData.end_date || undefined,
        auto_renew: rentalData.auto_renew,
      });
      if (!result.success) {
        setPlanErrors(result.error.issues.map((i) => i.message));
        return null;
      }
      return result.data;
    }

    return undefined as unknown as Record<string, unknown>;
  };

  const handleSave = async () => {
    if (!currentBrand || !user) return;

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Inserisci un importo valido");
      return;
    }

    // Validate plan details for installment/rental
    const planDetails = validatePlanDetails();
    if (planDetails === null) return; // validation failed

    setIsSaving(true);
    try {
      if (!user?.id) throw new Error("User not found");
      const userData = { id: user.id };
      const orderNumber = `QS-${Date.now().toString(36).toUpperCase()}`;

      // Use the shared untyped client (same auth session as the typed one)
      const { untypedClient } = await import("@/integrations/supabase/untypedClient");

      const { data: order, error: orderError } = await untypedClient
        .from("sales_orders")
        .insert({
          brand_id: currentBrand.id,
          contact_id: null,
          assigned_user_id: userData.id,
          order_number: orderNumber,
          status: "confirmed",
          subtotal: amount,
          discount_amount: 0,
          tax_amount: 0,
          total_amount: amount,
          paid_amount: amount,
          notes: `Vendita rapida${formData.customer_name ? ` - Cliente: ${formData.customer_name}` : ""}\n${formData.notes}`,
          confirmed_at: new Date().toISOString(),
          paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      const paymentInsert: Record<string, unknown> = {
        brand_id: currentBrand.id,
        order_id: order.id,
        amount: amount,
        method: formData.payment_method,
        status: "completed",
        paid_at: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString(),
        recorded_by_user_id: userData.id,
      };

      if (planDetails) {
        paymentInsert.plan_details = planDetails;
      }

      await untypedClient.from("payments").insert(paymentInsert);

      toast.success("Vendita registrata con successo!");
      handleClose();
      onSuccess?.();
    } catch (error) {
      console.error("Error saving sale:", error);
      toast.error("Errore nel salvataggio della vendita");
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualEntry = () => setStep("review");

  // Auto-calculate installment amount when total or num changes
  const autoCalcInstallment = (totalStr: string, numStr: string) => {
    const total = parseFloat(totalStr);
    const num = parseInt(numStr);
    if (!isNaN(total) && !isNaN(num) && num >= 2) {
      return (total / num).toFixed(2);
    }
    return "";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Vendita Rapida
          </DialogTitle>
          <DialogDescription>
            {step === "upload"
              ? "Scatta una foto o carica un documento per estrarre automaticamente i dati"
              : "Verifica e conferma i dati estratti"}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              {isProcessing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Analizzando il documento...</p>
                </div>
              ) : previewUrl ? (
                <div className="space-y-3">
                  <img src={previewUrl} alt="Preview" className="max-h-40 mx-auto rounded" />
                  <p className="text-sm text-muted-foreground">Elaborazione in corso...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-center gap-4">
                    <div className="p-3 rounded-full bg-primary/10">
                      <Camera className="h-6 w-6 text-primary" />
                    </div>
                    <div className="p-3 rounded-full bg-secondary">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                  </div>
                  <div>
                    <p className="font-medium">Carica foto documento</p>
                    <p className="text-sm text-muted-foreground">Scontrino, ricevuta, fattura o preventivo</p>
                  </div>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            <Separator />
            <Button variant="outline" className="w-full" onClick={handleManualEntry}>
              <FileText className="h-4 w-4 mr-2" />
              Inserisci manualmente
            </Button>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 py-4">
            {parsedData && (
              <Alert variant={parsedData.confidence > 0.7 ? "default" : "destructive"}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>
                    {parsedData.confidence > 0.7
                      ? "Dati estratti con alta confidenza"
                      : "Verifica attentamente i dati estratti"}
                  </span>
                  <Badge variant={parsedData.confidence > 0.7 ? "default" : "secondary"}>
                    {Math.round(parsedData.confidence * 100)}%
                  </Badge>
                </AlertDescription>
              </Alert>
            )}

            {previewUrl && (
              <Card>
                <CardContent className="p-2">
                  <img src={previewUrl} alt="Document" className="w-full h-20 object-cover rounded" />
                </CardContent>
              </Card>
            )}

            {/* Plan validation errors */}
            {planErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc pl-4 text-sm space-y-0.5">
                    {planErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount" className="flex items-center gap-1">
                    <Euro className="h-3 w-3" />
                    Importo totale *
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, amount: e.target.value }));
                      // Auto-recalculate installment amount
                      if (formData.payment_method === "installment") {
                        setInstallmentData((prev) => ({
                          ...prev,
                          installment_amount: autoCalcInstallment(e.target.value, prev.num_installments),
                        }));
                      }
                    }}
                    className="text-lg font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date" className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Data
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer" className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Cliente (opzionale)
                </Label>
                <Input
                  id="customer"
                  placeholder="Nome cliente"
                  value={formData.customer_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, customer_name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Metodo pagamento</Label>
                <Select
                  value={formData.payment_method}
                  onValueChange={(v) => {
                    setFormData((prev) => ({ ...prev, payment_method: v as PaymentMethod }));
                    setPlanErrors([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ─── Installment fields ─── */}
              {formData.payment_method === "installment" && (
                <Card className="border-primary/20">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-sm font-medium text-primary">Dettagli piano rate</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">N° rate *</Label>
                        <Input
                          type="number"
                          min="2"
                          value={installmentData.num_installments}
                          onChange={(e) => {
                            setInstallmentData((prev) => ({
                              ...prev,
                              num_installments: e.target.value,
                              installment_amount: autoCalcInstallment(formData.amount, e.target.value),
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Importo rata * (€)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={installmentData.installment_amount}
                          onChange={(e) =>
                            setInstallmentData((prev) => ({ ...prev, installment_amount: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Prima scadenza</Label>
                        <Input
                          type="date"
                          value={installmentData.first_due_date}
                          onChange={(e) =>
                            setInstallmentData((prev) => ({ ...prev, first_due_date: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Frequenza (mesi)</Label>
                        <Input
                          type="number"
                          min="1"
                          value={installmentData.frequency_months}
                          onChange={(e) =>
                            setInstallmentData((prev) => ({ ...prev, frequency_months: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ─── Rental fields ─── */}
              {formData.payment_method === "rental" && (
                <Card className="border-primary/20">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-sm font-medium text-primary">Dettagli noleggio</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Canone mensile * (€)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={rentalData.monthly_fee}
                          onChange={(e) =>
                            setRentalData((prev) => ({ ...prev, monthly_fee: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Durata (mesi) *</Label>
                        <Input
                          type="number"
                          min="1"
                          value={rentalData.duration_months}
                          onChange={(e) =>
                            setRentalData((prev) => ({ ...prev, duration_months: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Data inizio *</Label>
                        <Input
                          type="date"
                          value={rentalData.start_date}
                          onChange={(e) =>
                            setRentalData((prev) => ({ ...prev, start_date: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Data fine</Label>
                        <Input
                          type="date"
                          value={rentalData.end_date}
                          onChange={(e) =>
                            setRentalData((prev) => ({ ...prev, end_date: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Switch
                        id="auto-renew"
                        checked={rentalData.auto_renew}
                        onCheckedChange={(v) => setRentalData((prev) => ({ ...prev, auto_renew: v }))}
                      />
                      <Label htmlFor="auto-renew" className="text-xs cursor-pointer">
                        Rinnovo automatico
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Note / Dettagli</Label>
                <Textarea
                  id="notes"
                  placeholder="Prodotti, servizi, note..."
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                <X className="h-4 w-4 mr-2" />
                Annulla
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !formData.amount}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Conferma vendita
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}