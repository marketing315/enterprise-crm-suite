import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface TaxDisclaimerProps {
  compact?: boolean;
}

export function TaxDisclaimer({ compact = false }: TaxDisclaimerProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        <span>Stima gestionale, non fiscale</span>
      </div>
    );
  }

  return (
    <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900">
      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <AlertTitle className="text-blue-800 dark:text-blue-300">Stima Gestionale</AlertTitle>
      <AlertDescription className="text-blue-700 dark:text-blue-400">
        Questi dati sono calcolati per supporto decisionale interno. 
        Non costituiscono documentazione fiscale ufficiale.
      </AlertDescription>
    </Alert>
  );
}
