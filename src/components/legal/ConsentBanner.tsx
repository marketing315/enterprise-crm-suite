/**
 * Conditional cookie/consent banner.
 *
 * Status today: NO-OP. The application has zero third-party trackers
 * (Meta CAPI / GA4 are server-side only — see audit
 * mem://constraint/pwa-cache-auth-hardening). The banner only mounts if
 * a non-essential tracker is detected at runtime, so we are future-proof
 * without surfacing a useless modal to internal operators.
 *
 * How it activates:
 *   1. Add a tracker script to `index.html` or load it dynamically from
 *      a feature module.
 *   2. Register the tracker in `KNOWN_TRACKERS` below (or set the
 *      data-attribute `data-consent-required` on its <script> tag).
 *   3. The banner appears on the next page load until the user makes a
 *      choice; the choice is persisted in localStorage under
 *      `consent::v1` (technical cookie — exempt under ePrivacy art.5(3)).
 *
 * The banner is intentionally minimal and routes to /privacy for full
 * details. Granular toggles (analytics / marketing) are reserved for
 * when the project actually adds those trackers.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const CONSENT_STORAGE_KEY = "consent::v1";

/**
 * Globals exposed by common third-party trackers. If any of these is
 * truthy at mount time, we assume a tracker is loaded and a banner is
 * required.
 */
const KNOWN_TRACKERS: Array<{ name: string; check: () => boolean }> = [
  { name: "GA4 / gtag", check: () => typeof (window as any).gtag === "function" },
  { name: "GTM dataLayer", check: () => Array.isArray((window as any).dataLayer) && !!(window as any).google_tag_manager },
  { name: "Meta Pixel", check: () => typeof (window as any).fbq === "function" },
  { name: "Hotjar", check: () => typeof (window as any).hj === "function" },
  { name: "Clarity", check: () => typeof (window as any).clarity === "function" },
  { name: "Mixpanel", check: () => !!(window as any).mixpanel },
  { name: "Segment", check: () => !!(window as any).analytics?.load },
];

function detectTrackers(): string[] {
  if (typeof window === "undefined") return [];
  const found: string[] = [];
  for (const t of KNOWN_TRACKERS) {
    try {
      if (t.check()) found.push(t.name);
    } catch {
      /* no-op */
    }
  }
  // Also detect any <script data-consent-required> in the DOM.
  try {
    const tagged = document.querySelectorAll("script[data-consent-required]");
    if (tagged.length > 0) found.push(`+${tagged.length} script taggati`);
  } catch {
    /* no-op */
  }
  return found;
}

type ConsentState = { decided: true; accepted: boolean; at: string } | { decided: false };

function readConsent(): ConsentState {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return { decided: false };
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "accepted" in parsed) {
      return { decided: true, accepted: !!parsed.accepted, at: String(parsed.at || "") };
    }
  } catch {
    /* fall through */
  }
  return { decided: false };
}

function writeConsent(accepted: boolean): void {
  try {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ accepted, at: new Date().toISOString(), v: 1 }),
    );
  } catch {
    /* no-op */
  }
}

export function ConsentBanner() {
  const [trackers, setTrackers] = useState<string[]>([]);
  const [consent, setConsent] = useState<ConsentState>(() => readConsent());

  useEffect(() => {
    // Defer detection to the next tick so async tracker bootstrap can
    // populate window globals first.
    const id = window.setTimeout(() => {
      setTrackers(detectTrackers());
    }, 500);
    return () => window.clearTimeout(id);
  }, []);

  // No trackers detected → never render anything. Today's situation.
  if (trackers.length === 0) return null;

  // User already chose → don't render.
  if (consent.decided) return null;

  const accept = () => {
    writeConsent(true);
    setConsent({ decided: true, accepted: true, at: new Date().toISOString() });
  };

  const reject = () => {
    writeConsent(false);
    setConsent({ decided: true, accepted: false, at: new Date().toISOString() });
    // Best-effort: reload so any tracker that was loaded eagerly is not
    // reactivated. Real cookie wipe should be handled by the tracker's
    // own opt-out API where available.
    window.location.reload();
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Consenso uso strumenti di analisi"
      className="fixed inset-x-0 bottom-0 z-[9999] border-t border-border bg-background/95 p-4 shadow-lg backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-foreground">
          <p className="font-medium">Strumenti di analisi rilevati</p>
          <p className="text-muted-foreground">
            Questa pagina utilizza{" "}
            <span className="font-medium">{trackers.join(", ")}</span> per
            misurare l'uso del servizio. Consulta l'
            <Link to="/privacy" className="underline">informativa privacy</Link>{" "}
            per dettagli.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={reject}>
            Rifiuta
          </Button>
          <Button size="sm" onClick={accept}>
            Accetta
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Public helper: returns whether the user has consented to non-essential
 * tracking. Use this in tracker bootstrap code to gate loading.
 *   if (hasMarketingConsent()) loadGA4();
 */
export function hasMarketingConsent(): boolean {
  const c = readConsent();
  return c.decided && c.accepted;
}
