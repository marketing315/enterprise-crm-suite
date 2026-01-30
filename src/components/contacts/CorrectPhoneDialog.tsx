import { useState, useEffect } from 'react';
import { Pencil, AlertTriangle, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCorrectPhone } from '@/hooks/useCorrectPhone';
import { isValidPhoneNumber, normalizePhone } from '@/lib/phoneUtils';

interface CorrectPhoneDialogProps {
  contactId: string;
  currentPhone: string;
  isPrimary: boolean;
  onConflict?: (conflictingContactId: string) => void;
}

export function CorrectPhoneDialog({ 
  contactId, 
  currentPhone,
  isPrimary,
  onConflict 
}: CorrectPhoneDialogProps) {
  const [open, setOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [conflict, setConflict] = useState<{ contactId: string; message: string } | null>(null);
  
  const correctPhone = useCorrectPhone();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setNewPhone('');
      setConflict(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValidPhoneNumber(newPhone)) {
      return;
    }

    const result = await correctPhone.mutateAsync({
      contactId,
      oldPhone: currentPhone,
      newPhone,
    });

    if (result.success) {
      setOpen(false);
    } else if (result.error === 'phone_exists_other_contact') {
      setConflict({
        contactId: result.conflicting_contact_id!,
        message: result.message,
      });
    }
  };

  const handleViewConflict = () => {
    if (conflict && onConflict) {
      onConflict(conflict.contactId);
      setOpen(false);
    }
  };

  const normalized = newPhone ? normalizePhone(newPhone) : null;
  const isValid = newPhone && isValidPhoneNumber(newPhone);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Pencil className="h-3 w-3" />
          <span className="sr-only">Correggi numero</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correggi numero di telefono</DialogTitle>
          <DialogDescription>
            Il numero verrà aggiornato mantenendo lo storico degli eventi associati.
            {isPrimary && ' Questo è il numero principale.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Numero attuale</Label>
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
              <span className="font-mono text-sm">{currentPhone}</span>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPhone">Nuovo numero</Label>
            <Input
              id="newPhone"
              type="tel"
              placeholder="+39 333 1234567"
              value={newPhone}
              onChange={(e) => {
                setNewPhone(e.target.value);
                setConflict(null);
              }}
              className="font-mono"
            />
            {normalized && isValid && (
              <p className="text-xs text-muted-foreground">
                Normalizzato: {normalized.normalized} ({normalized.countryCode})
                {normalized.assumedCountry && ' - paese assunto'}
              </p>
            )}
          </div>

          {conflict && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Conflitto rilevato</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{conflict.message}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleViewConflict}
                >
                  Visualizza contatto
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={!isValid || correctPhone.isPending}
            >
              {correctPhone.isPending ? 'Correzione...' : 'Correggi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
