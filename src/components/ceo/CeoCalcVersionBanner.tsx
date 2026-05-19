import { Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'ceo_calc_version_dismissed';

interface Props {
  calcVersion?: string;
}

/**
 * Sprint 2 — Avvisa il CEO che i criteri di calcolo KPI sono stati aggiornati.
 * Dismissibile per versione: ricompare se calc_version cambia.
 */
export function CeoCalcVersionBanner({ calcVersion }: Props) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!calcVersion) return;
    try {
      const last = localStorage.getItem(STORAGE_KEY);
      setDismissed(last === calcVersion);
    } catch {
      setDismissed(false);
    }
  }, [calcVersion]);

  if (!calcVersion || dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, calcVersion);
    } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <Alert className="border-primary/30 bg-primary/5">
      <Info className="h-4 w-4 text-primary" />
      <AlertDescription className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <strong>I criteri di calcolo KPI sono stati aggiornati il {calcVersion}.</strong>{' '}
          Fuso orario allineato a Europa/Roma, ROI Marketing ora basato solo sul fatturato attribuibile a campagne, vendite "won" senza data di chiusura ora incluse, budget mensile mostrato anche su periodi corti.
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleDismiss} aria-label="Chiudi avviso">
          <X className="h-3.5 w-3.5" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
