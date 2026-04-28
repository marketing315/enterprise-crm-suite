import { useState } from "react";
import { Users, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAssignAppointmentSales } from "@/hooks/useAppointments";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { toast } from "sonner";

interface BulkReassignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentIds: string[];
  onDone?: () => void;
}

export function BulkReassignDialog({
  open,
  onOpenChange,
  appointmentIds,
  onDone,
}: BulkReassignDialogProps) {
  const [salesUserId, setSalesUserId] = useState<string>("");
  const { data: operators } = useBrandOperators();
  const salesUsers = operators?.filter((op) => op.role === "sales") || [];
  const assign = useAssignAppointmentSales();

  const handleConfirm = async () => {
    if (!salesUserId || appointmentIds.length === 0) return;
    let ok = 0;
    let ko = 0;
    for (const id of appointmentIds) {
      try {
        await assign.mutateAsync({ appointmentId: id, salesUserId });
        ok++;
      } catch {
        ko++;
      }
    }
    if (ok > 0) toast.success(`${ok} appuntamento/i riassegnato/i`);
    if (ko > 0) toast.error(`${ko} riassegnazione/i fallita/e`);
    setSalesUserId("");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Riassegna appuntamenti
          </DialogTitle>
          <DialogDescription>
            Stai per riassegnare {appointmentIds.length} appuntamento
            {appointmentIds.length === 1 ? "" : "i"} a un altro venditore.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Select value={salesUserId} onValueChange={setSalesUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona nuovo venditore" />
            </SelectTrigger>
            <SelectContent>
              {salesUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Alert>
            <AlertDescription className="text-xs">
              La riassegnazione non sposta gli orari. Verifica eventuali
              sovrapposizioni nel calendario del nuovo venditore.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={assign.isPending}
          >
            Annulla
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!salesUserId || assign.isPending}
          >
            {assign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Conferma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
