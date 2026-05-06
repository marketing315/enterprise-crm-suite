import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Ticket } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTicket, type TicketSourceContext } from "@/hooks/useTickets";
import { toast } from "sonner";

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName?: string;
  dealId?: string | null;
  dealTitle?: string | null;
  sourceContext?: TicketSourceContext;
  onSuccess?: (ticketId: string) => void;
}

export function CreateTicketDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  dealId,
  dealTitle,
  sourceContext,
  onSuccess,
}: CreateTicketDialogProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("3");
  
  const createTicket = useCreateTicket();

  // Pre-populate title when opening from a deal
  useEffect(() => {
    if (open && dealTitle && !title) {
      setTitle(`[${dealTitle}] Richiesta supporto`);
    }
  }, [open, dealTitle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error("Inserisci un titolo per il ticket");
      return;
    }

    try {
      const ticketId = await createTicket.mutateAsync({
        contactId,
        dealId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority: parseInt(priority, 10),
        sourceContext,
      });

      toast.success("Ticket creato con successo");
      setTitle("");
      setDescription("");
      setPriority("3");
      onOpenChange(false);

      if (onSuccess) {
        onSuccess(ticketId);
      } else {
        // Default: deep-link to the new ticket
        navigate(`/tickets?open=${ticketId}`);
      }
    } catch (error) {
      toast.error("Errore nella creazione del ticket");
    }
  };

  const handleClose = () => {
    setTitle("");
    setDescription("");
    setPriority("3");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Nuovo Ticket
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {contactName && (
            <div className="text-sm text-muted-foreground">
              Contatto: <span className="font-medium text-foreground">{contactName}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Titolo *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Descrivi brevemente il problema"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrizione</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dettagli aggiuntivi (opzionale)"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priorità</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">P1 - Critica</SelectItem>
                <SelectItem value="2">P2 - Alta</SelectItem>
                <SelectItem value="3">P3 - Media</SelectItem>
                <SelectItem value="4">P4 - Bassa</SelectItem>
                <SelectItem value="5">P5 - Minima</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={createTicket.isPending}>
              {createTicket.isPending ? "Creazione..." : "Crea Ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
