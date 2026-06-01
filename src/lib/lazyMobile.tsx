/**
 * F7.3 — helper per code-split delle viste mobile.
 *
 * Le pagine importavano staticamente `Mobile*` accanto al desktop: ogni utente
 * desktop scaricava anche il chunk mobile (e viceversa). Con `lazyMobile` la
 * vista mobile vive in un chunk separato caricato on-demand solo quando
 * `useIsMobile()` è vero. Il fallback è un placeholder full-screen senza CLS.
 */
import { ComponentType, lazy, Suspense } from "react";

/**
 * Costruisce un componente lazy a partire da un loader dinamico.
 * Esempio:
 *
 *   const MobileX = lazyMobile(() =>
 *     import("@/components/x/mobile/MobileX").then(m => ({ default: m.MobileX }))
 *   );
 */
export function lazyMobile(
  loader: () => Promise<{ default: ComponentType<unknown> }>,
): ComponentType<Record<string, unknown>> {
  const Lazy = lazy(loader);
  return function MobileLazyHost(props: Record<string, unknown>) {
    return (
      <Suspense fallback={<div className="min-h-[100dvh] bg-background" aria-hidden />}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Lazy {...(props as any)} />
      </Suspense>
    );
  };
}
