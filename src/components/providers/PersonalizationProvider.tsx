import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useUIPreferences, useApplyDensity } from "@/hooks/useUIPreferences";

/**
 * Reads persisted UI preferences and applies them globally:
 * - Density attribute on <html>
 * - i18n language sync
 *
 * Theme is handled by next-themes (ThemeProvider).
 */
export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const { prefs } = useUIPreferences();
  const { i18n } = useTranslation();

  useApplyDensity(prefs.density);

  useEffect(() => {
    if (prefs.language && i18n.language !== prefs.language) {
      void i18n.changeLanguage(prefs.language);
    }
  }, [prefs.language, i18n]);

  return <>{children}</>;
}
