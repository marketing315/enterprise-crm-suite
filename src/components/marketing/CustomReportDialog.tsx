import { useState } from "react";
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

export function CustomReportDialog() {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [period, setPeriod] = useState<"week" | "month" | "custom">("week");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const handleSend = async () => {
    setSending(true);
    try {
      const brandIds = isAllBrandsSelected
        ? allBrandIds
        : currentBrand?.id
        ? [currentBrand.id]
        : [];

      const payload: Record<string, unknown> = {
        period,
        brand_ids: brandIds,
      };

      if (period === "custom") {
        payload.from = customFrom;
        payload.to = customTo;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-n8n-webhook`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          toast.error("Limite di invio raggiunto (max 20/ora)");
        } else {
          toast.error(result.error || "Errore nell'invio del report");
        }
        return;
      }

      if (result.success) {
        toast.success("Report inviato con successo!");
        setOpen(false);
      } else {
        toast.warning(`Report generato ma n8n ha risposto con status ${result.n8n_status}`);
      }
    } catch (err) {
      console.error("Error sending report:", err);
      toast.error("Errore imprevisto nell'invio del report");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Send className="h-4 w-4" />
          Invia Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Invia Report Marketing</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Periodo</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as "week" | "month" | "custom")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Settimana scorsa</SelectItem>
                <SelectItem value="month">Mese scorso</SelectItem>
                <SelectItem value="custom">Personalizzato</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {period === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Da</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>A</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            Il report verrà generato per{" "}
            <strong>
              {isAllBrandsSelected ? "tutti i brand" : currentBrand?.name || "il brand selezionato"}
            </strong>{" "}
            e inviato via n8n.
          </div>

          <Button onClick={handleSend} disabled={sending} className="w-full gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Invio in corso..." : "Invia Report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
