import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Global storage for the install prompt so it persists across component mounts
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

// Set up global listener immediately when module loads
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    // Dispatch custom event so any mounted hooks can react
    window.dispatchEvent(new CustomEvent("pwa-prompt-available"));
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
  const [isInstallable, setIsInstallable] = useState(!!globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone || isIOSStandalone);

    // Check if iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // Sync with global prompt if available
    if (globalDeferredPrompt) {
      setDeferredPrompt(globalDeferredPrompt);
      setIsInstallable(true);
    }

    // Listen for prompt becoming available
    const handlePromptAvailable = () => {
      setDeferredPrompt(globalDeferredPrompt);
      setIsInstallable(true);
    };

    // Listen for new install prompt (backup for component-level)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(globalDeferredPrompt);
      setIsInstallable(true);
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      globalDeferredPrompt = null;
    };

    window.addEventListener("pwa-prompt-available", handlePromptAvailable);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("pwa-prompt-available", handlePromptAvailable);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const installApp = useCallback(async () => {
    const promptToUse = deferredPrompt || globalDeferredPrompt;
    if (!promptToUse) return false;

    try {
      await promptToUse.prompt();
      const { outcome } = await promptToUse.userChoice;
      
      if (outcome === "accepted") {
        setIsInstalled(true);
        setIsInstallable(false);
      }
      
      setDeferredPrompt(null);
      globalDeferredPrompt = null;
      return outcome === "accepted";
    } catch (error) {
      console.error("Error installing PWA:", error);
      return false;
    }
  }, [deferredPrompt]);

  return {
    isInstallable,
    isInstalled,
    isIOS,
    installApp,
  };
}
