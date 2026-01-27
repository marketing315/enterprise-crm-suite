import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteInboundSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: { id: string; name: string } | null;
}

export function DeleteInboundSourceDialog({
  open,
  onOpenChange,
  source,
}: DeleteInboundSourceDialogProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!source?.id) throw new Error("No source to delete");
      const { error } = await supabase
        .from("webhook_sources")
        .delete()
        .eq("id", source.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbound-sources"] });
      toast.success("Sorgente eliminata");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Elimina sorgente</AlertDialogTitle>
          <AlertDialogDescription>
            Sei sicuro di voler eliminare la sorgente "{source?.name}"?
            <br />
            <br />
            Questa azione è irreversibile. Tutti i lead già ricevuti rimarranno
            nel sistema, ma non sarà più possibile riceverne di nuovi da questa
            sorgente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? "Eliminazione..." : "Elimina"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
