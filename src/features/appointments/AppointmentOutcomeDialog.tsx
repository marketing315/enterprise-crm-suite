/**
 * AppointmentOutcomeDialog — UI to register an outcome for an appointment.
 * Calls public.record_appointment_outcome via useRecordOutcome.
 * Append-only: legacy appointments without outcomes remain untouched.
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  APPOINTMENT_OUTCOMES,
  APPOINTMENT_OUTCOME_ORDER,
  type AppointmentOutcomeCode,
} from "./taxonomy";
import { useRecordOutcome } from "./useRecordOutcome";

interface Props {
  appointmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName?: string;
  onRecorded?: () => void;
}

export function AppointmentOutcomeDialog({
  appointmentId,
  open,
  onOpenChange,
  contactName,
  onRecorded,
}: Props) {
  const [code, setCode] = useState<AppointmentOutcomeCode | null>(null);
  const [notes, setNotes] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [nextAction, setNextAction] = useState("");

  const meta = useMemo(() => (code ? APPOINTMENT_OUTCOMES[code] : null), [code]);
  const mutation = useRecordOutcome();

  const reset = () => {
    setCode(null);
    setNotes("");
    setRescheduleReason("");
    setNextAction("");
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const canSubmit =
    !!code &&
    !mutation.isPending &&
    (!meta?.requiresRescheduleReason || rescheduleReason.trim().length > 0);

  const handleSubmit = async () => {
    if (!code) return;
    try {
      await mutation.mutateAsync({
        appointmentId,
        outcomeCode: code,
        outcomeNotes: notes.trim() || null,
        rescheduleReason: rescheduleReason.trim() || null,
        nextAction: nextAction.trim() || null,
      });
      reset();
      onOpenChange(false);
      onRecorded?.();
    } catch {
      // toast handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registra esito appuntamento</DialogTitle>
          <DialogDescription>
            {contactName ? <>Esito per <span className="font-medium">{contactName}</span>.</> : null}{" "}
            Lo storico è append-only: ogni esito viene archiviato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Outcome picker */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Esito
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {APPOINTMENT_OUTCOME_ORDER.map((c) => {
                const m = APPOINTMENT_OUTCOMES[c];
                const Icon = m.icon;
                const active = code === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCode(c)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-all",
                      "hover:border-primary/40 hover:bg-accent/40",
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border bg-background"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
            {meta && (
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="outline" className={meta.badgeClass}>
                  {meta.label}
                </Badge>
                <p className="text-xs text-muted-foreground">{meta.description}</p>
              </div>
            )}
          </div>

          {/* Reschedule reason */}
          {meta?.requiresRescheduleReason && (
            <div className="space-y-2">
              <Label htmlFor="reschedule_reason">
                Motivo riprogrammazione <span className="text-destructive">*</span>
              </Label>
              <Input
                id="reschedule_reason"
                placeholder="Es. cliente impegnato, necessita altra data…"
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="outcome_notes">Note</Label>
            <Textarea
              id="outcome_notes"
              placeholder="Dettagli sull'esito (facoltativo)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Next action */}
          {meta?.suggestsNextAction && (
            <div className="space-y-2">
              <Label htmlFor="next_action">Prossima azione</Label>
              <Input
                id="next_action"
                placeholder="Es. richiamare entro 48h, preparare preventivo…"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={mutation.isPending}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {mutation.isPending ? "Salvataggio…" : "Registra esito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
