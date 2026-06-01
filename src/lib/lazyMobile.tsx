/**
 * F7.3 — helper per code-split delle viste mobile.
 *
 * Le pagine importavano staticamente `Mobile*` accanto al desktop: ogni utente
 * desktop scaricava anche il chunk mobile (e viceversa). Con `lazyMobile` la
 * vista mobile vive in un chunk separato caricato on-demand solo quando
 * `useIsMobile()` è vero. Il fallback è un placeholder full-screen senza CLS.
 */
import { ComponentType, lazy, ReactElement, Suspense } from "react";

type AnyProps = Record<string, unknown>;

interface LoaderResult<T extends ComponentType<AnyProps>> {
  default?: T;
  [key: string]: T | undefined;
}

/**
 * Costruisce un componente lazy a partire da un loader dinamico.
 * Il loader può ritornare un modulo con `default` o con export nominato:
 *
 *   const MobileX = lazyMobile(() =>
 *     import("@/components/x/mobile/MobileX").then(m => ({ default: m.MobileX }))
 *   );
 *
 * Wrapper standard con Suspense + fallback opaco (`bg-background min-h-[100dvh]`)
 * per evitare flash bianco / CLS percepito.
 */
export function lazyMobile<P extends AnyProps = AnyProps>(
  loader: () => Promise<LoaderResult<ComponentType<P>>>,
): (props: P) => ReactElement {
  const Lazy = lazy(async () => {
    const mod = await loader();
    const cmp = (mod.default ?? Object.values(mod).find((v) => typeof v === "function")) as
      | ComponentType<P>
      | undefined;
    if (!cmp) {
      throw new Error("lazyMobile: nessun componente esportato dal modulo");
    }
    return { default: cmp };
  });

  return function MobileLazyHost(props: P) {
    return (
      <Suspense fallback={<div className="min-h-[100dvh] bg-background" aria-hidden />}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
