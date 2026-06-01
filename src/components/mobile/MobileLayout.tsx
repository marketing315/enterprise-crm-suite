import { useCallback, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { IncomingCallPopup } from '@/components/contacts/IncomingCallPopup';
import { IdleTimeoutWatcher } from '@/components/auth/IdleTimeoutWatcher';
import { RealtimeStaleBanner } from '@/components/realtime/RealtimeStaleBanner';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import { AppTour } from '@/components/onboarding/AppTour';
import { useBrand } from '@/contexts/BrandContext';
import { MobileHeader } from './MobileHeader';
import { MobileTabBarConnected } from './MobileTabBar';
import { MobileMoreSheet } from './MobileMoreSheet';
import { MobileSearch } from './MobileSearch';
import type { MobileTabAction } from '@/hooks/useRoleMobileTabs';

/**
 * `MobileLayout` — shell mobile (SPEC §5) usata SOLO quando `useIsMobile()` è true.
 *
 * Riusa gli stessi provider/contesti già montati in `App.tsx` (auth, brand, realtime,
 * notifiche, query client). Monta gli stessi "side-effect" globali di `MainLayout`
 * (incoming call, idle watcher, banner realtime, welcome/app tour) perché vivono
 * dentro l'albero protetto post-login.
 *
 * Composizione:
 *  - skip-link a11y
 *  - `MobileHeader` sticky con titolo/brand
 *  - `<Outlet/>` per le pagine
 *  - `MobileTabBarConnected` (tab per ruolo via `useRoleMobileTabs`)
 *  - sheet "Menu" globale (`MobileMoreSheet`) e ricerca full-screen (`MobileSearch`)
 *
 * Le action delle tab (`menu`/`search`/`notifications`/`new-*`) sono dispatchate
 * qui: sheet locali per menu/search; `navigate` con `?new=1` per i flussi di
 * creazione (le pagine destinatarie possono leggere la query per aprire il loro
 * dialog dedicato — follow-up per le creazioni inline).
 */
export function MobileLayout() {
  const navigate = useNavigate();
  const { currentBrand } = useBrand();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleAction = useCallback(
    (action: MobileTabAction) => {
      switch (action) {
        case 'menu':
          setMenuOpen(true);
          return;
        case 'search':
          setSearchOpen(true);
          return;
        case 'notifications':
          navigate('/notifications');
          return;
        case 'new-contact':
          navigate('/contacts?new=1');
          return;
        case 'new-call':
          navigate('/callcenter?new=1');
          return;
        case 'new-appointment':
          navigate('/appointments?new=1');
          return;
        case 'new-ticket':
          navigate('/tickets?new=1');
          return;
        default:
          return;
      }
    },
    [navigate],
  );

  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      {/* H11 a11y: primo elemento focusable */}
      <a href="#main-content" className="skip-to-content">
        Vai al contenuto principale
      </a>

      {/* Side-effect globali (replicano MainLayout post-login) */}
      <IncomingCallPopup />
      <IdleTimeoutWatcher />
      <RealtimeStaleBanner />
      <WelcomeModal />
      <AppTour />

      <MobileHeader
        title="CRM"
        subtitle={currentBrand?.name ?? undefined}
        onSubtitleClick={currentBrand ? () => setMenuOpen(true) : undefined}
      />

      <main
        id="main-content"
        tabIndex={-1}
        aria-label="Contenuto principale"
        className="flex-1 overflow-y-auto overscroll-contain"
      >
        <ErrorBoundary label="Pagina">
          <Outlet />
        </ErrorBoundary>
      </main>

      <MobileTabBarConnected onAction={handleAction} />

      <MobileMoreSheet open={menuOpen} onOpenChange={setMenuOpen} />
      <MobileSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

export default MobileLayout;
