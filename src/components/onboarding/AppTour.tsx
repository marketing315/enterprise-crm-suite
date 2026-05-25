import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useOnboardingStatus, useCompleteTour } from '@/hooks/useOnboardingStatus';
import { useBrand } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import type { DriveStep } from 'driver.js';

/**
 * Tour interattivo 4-step. Si avvia una volta sola dopo welcome,
 * richiede sessione autenticata + brand selezionato. Salvato in users.tour_completed_at.
 *
 * Espone window.__restartAppTour() per "Rivedi il tour".
 *
 * H12 (audit C-level): hardening guard. Il tour può navigare a `/dashboard`
 * — questa è una route protetta. Senza guard, `__restartAppTour()`
 * chiamato da DevTools (o da una pagina pubblica come /login, /privacy)
 * forzerebbe una navigazione su una sezione che richiede autenticazione,
 * generando flash di UI protetta + redirect rumorosi e potenziali side
 * effect su brand non ancora selezionato.
 *
 * Mitigazioni:
 *  - `start()` esce subito se manca sessione o brand.
 *  - `__restartAppTour` è esposto SOLO quando user è auth + brand attivo;
 *    rimosso al logout/cambio brand.
 *  - `start` memoizzato con `useCallback` e dipendenze esplicite, così
 *    l'effect di esposizione non riusa una closure stantia.
 */
export function AppTour() {
  const { needsTour, refetch } = useOnboardingStatus();
  const completeTour = useCompleteTour();
  const { hasBrandSelected } = useBrand();
  const { session, isLoading: authLoading, isAdmin, isCeo, hasRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const driverRef = useRef<Driver | null>(null);
  const startedRef = useRef(false);

  const isAuthenticated = !!session && !authLoading;

  const start = useCallback(
    (markComplete: boolean) => {
      // H12: hard guard — non avviare il tour se l'utente non è autenticato
      // o non ha un brand selezionato. Evita navigazioni a /dashboard
      // (route protetta) da contesti pubblici (login, privacy, OAuth callback).
      if (!isAuthenticated || !hasBrandSelected) {
        console.warn('[AppTour] start aborted: missing auth or brand');
        return;
      }

      // Assicurati di essere su /dashboard per avere accesso ai target visibili
      if (location.pathname !== '/dashboard') {
        navigate('/dashboard');
      }

      // Defer per dare tempo al DOM di renderizzare
      setTimeout(() => {
        // H12: re-check post-defer — l'utente potrebbe aver fatto logout
        // nei 400ms di setTimeout (caso edge ma reale).
        if (!isAuthenticated || !hasBrandSelected) {
          driverRef.current?.destroy();
          driverRef.current = null;
          return;
        }

        const hasInsightAccess =
          isAdmin ||
          isCeo ||
          hasRole?.('amministrazione') ||
          hasRole?.('responsabile_venditori') ||
          hasRole?.('responsabile_callcenter');

        const steps: DriveStep[] = [
          {
            popover: {
              title: '👋 Benvenuto nel CRM Gruppo Benessere',
              description:
                'Ti guido in 60 secondi tra le sezioni principali. Puoi rivedere il tour quando vuoi dal menu utente in basso a sinistra.',
            },
          },
          {
            element: '[data-tour="brand-selector"]',
            popover: {
              title: '1 · Selettore brand',
              description:
                'Scegli su quale brand operare. <b>Tutte le viste, KPI e notifiche</b> vengono filtrate sul brand attivo. Gli amministratori vedono anche il brand di sistema (vista aggregata).',
            },
          },
          {
            element: '[data-tour="nav-daily"]',
            popover: {
              title: '2 · Operatività quotidiana',
              description:
                '<b>Dashboard, Contatti, Pipeline, Appuntamenti, Ticket e Chat</b>: tutto ciò che usi ogni giorno per gestire lead e clienti, con realtime e ricerca globale (⌘K).',
            },
          },
          {
            element: '[data-tour="notifications"]',
            popover: {
              title: '3 · Centro notifiche',
              description:
                'Nuovi lead, escalation ticket, SLA in scadenza e alert performance compaiono qui in tempo reale. Clicca la campanella per gestire le sottoscrizioni push.',
            },
          },
          ...(hasInsightAccess
            ? [
                {
                  element: '[data-tour="nav-insight"]',
                  popover: {
                    title: '4 · Performance Hub & Insight',
                    description:
                      'Accedi al nuovo <b>Performance Hub</b> con marketing, call center wallboard, foglio venditori, trascrizioni AI, alert configurabili e retention. Una suite C-Level per pilotare il business.',
                  },
                } satisfies DriveStep,
              ]
            : []),
          {
            element: '[data-tour="new-contact"]',
            popover: {
              title: hasInsightAccess ? '5 · Crea il primo contatto' : '4 · Crea il primo contatto',
              description:
                'Quando sei pronto, parti da qui per inserire un contatto. Telefono ed email vengono deduplicati in automatico per evitare doppioni.',
            },
          },
          {
            popover: {
              title: '🎉 Sei pronto a partire',
              description:
                'Tip: puoi <b>rivedere questo tour</b> in qualsiasi momento dal menu utente. Per aiuto rapido, premi <kbd>⌘K</kbd> (Mac) o <kbd>Ctrl+K</kbd> (Windows).',
            },
          },
        ];

        const d = driver({
          showProgress: true,
          allowClose: true,
          nextBtnText: 'Avanti',
          prevBtnText: 'Indietro',
          doneBtnText: 'Inizia',
          progressText: '{{current}} di {{total}}',
          steps,
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
    },
    [isAuthenticated, hasBrandSelected, location.pathname, navigate, completeTour, refetch, isAdmin, isCeo, hasRole],
  );

  // Auto-start quando tutte le condizioni sono soddisfatte
  useEffect(() => {
    if (startedRef.current) return;
    if (!isAuthenticated || !needsTour || !hasBrandSelected) return;
    startedRef.current = true;
    start(true);
  }, [isAuthenticated, needsTour, hasBrandSelected, start]);

  // H12: esponi handle globale SOLO se l'utente è auth + brand selezionato.
  // Su logout / cambio sessione la closure viene riallocata e l'handle
  // viene rimosso, impedendo a vecchio JS in memoria di re-attivare il tour.
  useEffect(() => {
    if (!isAuthenticated || !hasBrandSelected) {
      delete (window as { __restartAppTour?: () => void }).__restartAppTour;
      // Inoltre, se un tour era in corso, distruggilo.
      driverRef.current?.destroy();
      driverRef.current = null;
      return;
    }
    (window as { __restartAppTour?: () => void }).__restartAppTour = () => {
      // Re-check al momento dell'invocazione (defense in depth).
      if (!isAuthenticated || !hasBrandSelected) return;
      driverRef.current?.destroy();
      start(false);
    };
    return () => {
      delete (window as { __restartAppTour?: () => void }).__restartAppTour;
    };
  }, [isAuthenticated, hasBrandSelected, start]);

  return null;
}
