import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useCreatePipelineStage } from "@/hooks/usePipelineStagesAdmin";

const STAGE_COLORS = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Viola" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#ef4444", label: "Rosso" },
  { value: "#f97316", label: "Arancione" },
  { value: "#eab308", label: "Giallo" },
  { value: "#22c55e", label: "Verde" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#3b82f6", label: "Blu" },
  { value: "#64748b", label: "Grigio" },
];

interface AddStageDialogProps {
  trigger?: React.ReactNode;
}

export function AddStageDialog({ trigger }: AddStageDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const createStage = useCreatePipelineStage();

  const handleCreate = async () => {
    if (!name.trim()) return;

    await createStage.mutateAsync({ name, color });
    setName("");
    setColor("#6366f1");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Aggiungi fase
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuova Fase Pipeline</DialogTitle>
          <DialogDescription>
            Aggiungi una nuova fase alla pipeline di vendita.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="stage-name">Nome fase</Label>
            <Input
              id="stage-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. Primo Contatto"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="space-y-2">
            <Label>Colore</Label>
            <div className="flex flex-wrap gap-2">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    color === c.value
                      ? "border-foreground scale-110"
                      : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Annulla
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createStage.isPending}
          >
            {createStage.isPending ? "Creazione..." : "Crea fase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
