import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useOnboardingStatus, useCompleteTour } from '@/hooks/useOnboardingStatus';
import { useBrand } from '@/contexts/BrandContext';

/**
 * Tour interattivo 4-step. Si avvia una volta sola dopo welcome,
 * richiede brand selezionato. Salvato in users.tour_completed_at.
 *
 * Espone window.__restartAppTour() per "Rivedi il tour".
 */
export function AppTour() {
  const { needsTour, refetch } = useOnboardingStatus();
  const completeTour = useCompleteTour();
  const { hasBrandSelected } = useBrand();
  const location = useLocation();
  const navigate = useNavigate();
  const driverRef = useRef<Driver | null>(null);
  const startedRef = useRef(false);

  const start = (markComplete: boolean) => {
    // Assicurati di essere su /dashboard per avere accesso ai target visibili
    if (location.pathname !== '/dashboard') {
      navigate('/dashboard');
    }

    // Defer per dare tempo al DOM di renderizzare
    setTimeout(() => {
      const d = driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: 'Avanti',
        prevBtnText: 'Indietro',
        doneBtnText: 'Fine',
        progressText: '{{current}} di {{total}}',
        steps: [
          {
            element: '[data-tour="brand-selector"]',
            popover: {
              title: 'Selettore brand',
              description: 'Da qui scegli su quale brand stai lavorando. Tutte le viste sono filtrate sul brand attivo.',
            },
          },
          {
            element: '[data-tour="nav-daily"]',
            popover: {
              title: 'Le tue attività quotidiane',
              description: 'Dashboard, Contatti, Pipeline, Appuntamenti, Ticket e Chat: tutto ciò che usi ogni giorno.',
            },
          },
          {
            element: '[data-tour="notifications"]',
            popover: {
              title: 'Notifiche',
              description: 'Nuovi lead, ticket urgenti e avvisi importanti compaiono qui in tempo reale.',
            },
          },
          {
            element: '[data-tour="new-contact"]',
            popover: {
              title: 'Crea il tuo primo contatto',
              description: 'Quando sei pronto, parti da qui per inserire il primo contatto nel CRM.',
            },
          },
        ],
        onDestroyed: async () => {
          if (markComplete) {
            try {
              await completeTour.mutateAsync();
              await refetch();
            } catch {
              /* silently ignore */
            }
          }
        },
      });
      driverRef.current = d;
      d.drive();
    }, 400);
  };

  // Auto-start quando tutte le condizioni sono soddisfatte
  useEffect(() => {
    if (startedRef.current) return;
    if (!needsTour || !hasBrandSelected) return;
    startedRef.current = true;
    start(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsTour, hasBrandSelected]);

  // Esponi handle globale per "Rivedi il tour"
  useEffect(() => {
    (window as any).__restartAppTour = () => {
      driverRef.current?.destroy();
      start(false);
    };
    return () => {
      delete (window as any).__restartAppTour;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return null;
}
