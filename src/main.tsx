import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Suppress harmless AbortError rejections (React Query signal cancellations)
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  if (
    (reason instanceof DOMException && reason.name === "AbortError") ||
    (typeof reason === "object" && reason !== null && Object.keys(reason).length === 0)
  ) {
    event.preventDefault();
    return;
  }
});

// PWA: guard registration against iframe / preview hosts to avoid stale
// content and navigation interference inside the Lovable editor preview.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
} else {
  // @ts-expect-error virtual module injected by vite-plugin-pwa
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({
        onRegistered(r: ServiceWorkerRegistration | undefined) {
          if (r) {
            console.log("[PWA] Service Worker registered");
          }
        },
        onRegisterError(error: unknown) {
          console.error("[PWA] Service Worker registration failed:", error);
        },
      });
    })
    .catch(() => {
      // In dev mode the virtual module may not resolve; this is expected.
    });
}

createRoot(document.getElementById("root")!).render(<App />);
