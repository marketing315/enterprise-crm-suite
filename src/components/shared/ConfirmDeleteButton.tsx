import { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ConfirmDeleteButtonProps {
  onConfirm: () => void;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  disabled?: boolean;
  size?: 'icon' | 'sm';
  className?: string;
}

/**
 * Sprint 3 — Pulsante di eliminazione con conferma esplicita.
 * Da usare su tutti i delete su dati finanziari (costi, budget, ecc.).
 */
export function ConfirmDeleteButton({
  onConfirm,
  title = 'Confermi eliminazione?',
  description = 'Questa azione non è reversibile. La cancellazione viene tracciata nei log audit.',
  confirmLabel = 'Elimina',
  disabled,
  size = 'icon',
  className = '',
}: ConfirmDeleteButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className={size === 'icon' ? `h-7 w-7 ${className}` : className}
          disabled={disabled}
          aria-label="Elimina"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
