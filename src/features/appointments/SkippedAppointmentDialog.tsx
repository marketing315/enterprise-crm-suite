/**
 * SkippedAppointmentDialog — quick negative outcome registration.
 * Always uses taxonomy codes (no hardcoded strings).
 */
import { useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { APPOINTMENT_OUTCOMES, type AppointmentOutcomeCode } from "./taxonomy";
import { useRecordOutcome } from "./useRecordOutcome";

const SKIP_CODES: AppointmentOutcomeCode[] = [
  "no_show_client",
  "no_show_operator",
  "cancelled_client",
  "unreachable",
];

interface Props {
  appointmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName?: string;
  onRecorded?: () => void;
}

export function SkippedAppointmentDialog({
  appointmentId,
  open,
  onOpenChange,
  contactName,
  onRecorded,
}: Props) {
  const [code, setCode] = useState<AppointmentOutcomeCode>("no_show_client");
  const [notes, setNotes] = useState("");
  const mutation = useRecordOutcome();

  const reset = () => {
    setCode("no_show_client");
    setNotes("");
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const canSubmit = notes.trim().length > 0 && !mutation.isPending;

  const handleSubmit = async () => {
    try {
      await mutation.mutateAsync({
        appointmentId,
        outcomeCode: code,
        outcomeNotes: notes.trim(),
      });
      reset();
      onOpenChange(false);
      onRecorded?.();
    } catch {
      /* toast in hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Appuntamento saltato</DialogTitle>
          <DialogDescription>
            {contactName ? (
              <>
                Registra il motivo del salto per <span className="font-medium">{contactName}</span>.
              </>
            ) : (
              "Registra il motivo del salto."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</Label>
            <RadioGroup
              value={code}
              onValueChange={(v) => setCode(v as AppointmentOutcomeCode)}
              className="grid grid-cols-1 gap-1.5"
            >
              {SKIP_CODES.map((c) => {
                const m = APPOINTMENT_OUTCOMES[c];
                return (
                  <label
                    key={c}
                    htmlFor={`skip-${c}`}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-accent/40"
                  >
                    <RadioGroupItem id={`skip-${c}`} value={c} />
                    <m.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{m.label}</span>
                  </label>
                );
              })}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="skip-notes">
              Motivazione <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="skip-notes"
              placeholder="Descrivi cosa è successo…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={mutation.isPending}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {mutation.isPending ? "Salvataggio…" : "Registra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
