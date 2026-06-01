import { useIsMobile } from '@/hooks/use-mobile';
import { MainLayout } from './MainLayout';
import { MobileLayout } from '@/components/mobile/MobileLayout';

/**
 * Switch fra `MainLayout` (desktop, ≥768px) e `MobileLayout` (<768px).
 * Vive dentro lo stesso albero di provider in `App.tsx`: non aggiunge né rimuove
 * contesti rispetto al setup attuale. L'hook `useIsMobile` reagisce ai resize
 * via `matchMedia('(max-width: 767px)')` (SPEC §1).
 */
export function ResponsiveLayout() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileLayout /> : <MainLayout />;
}

export default ResponsiveLayout;
