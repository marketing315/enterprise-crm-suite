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
import { useMetaApps, MetaApp } from "@/hooks/useMetaApps";

interface DeleteMetaAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metaApp: MetaApp | null;
}

export function DeleteMetaAppDialog({ open, onOpenChange, metaApp }: DeleteMetaAppDialogProps) {
  const { deleteMetaApp } = useMetaApps();

  const handleDelete = async () => {
    if (!metaApp) return;
    await deleteMetaApp.mutateAsync(metaApp.id);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare questa Meta App?</AlertDialogTitle>
          <AlertDialogDescription>
            Stai per eliminare la configurazione per <strong>{metaApp?.brand_slug}</strong>.
            Il webhook smetterà di funzionare immediatamente.
            Questa azione non può essere annullata.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
