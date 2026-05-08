import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type Density = "comfortable" | "compact";
export type UILanguage = "it" | "en";

export interface UIPreferences {
  theme: string | null;
  density: Density;
  language: UILanguage;
  preferences: Record<string, unknown>;
}

const LOCAL_KEY = "ralph.ui-prefs";

const DEFAULTS: UIPreferences = {
  theme: null,
  density: "comfortable",
  language: "it",
  preferences: {},
};

function readLocal(): UIPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<UIPreferences>;
    return {
      theme: parsed.theme ?? null,
      density: parsed.density === "compact" ? "compact" : "comfortable",
      language: parsed.language === "en" ? "en" : "it",
      preferences: typeof parsed.preferences === "object" && parsed.preferences ? parsed.preferences as Record<string, unknown> : {},
    };
  } catch {
    return DEFAULTS;
  }
}

function writeLocal(p: UIPreferences) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function useUIPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<UIPreferences>({
    queryKey: ["ui-preferences", user?.id],
    initialData: readLocal,
    queryFn: async () => {
      if (!user) return readLocal();
      // RLS già filtra la riga sull'utente corrente (user_id = get_user_id(auth.uid())).
      // Non aggiungere .eq("user_id", user.id): user.id è auth.uid() ma la colonna contiene l'internal id.
      const { data, error } = await supabase
        .from("user_ui_preferences")
        .select("theme, density, language, preferences")
        .maybeSingle();
      if (error) {
        if (import.meta.env.DEV) console.debug("[useUIPreferences] fetch error", error.message);
        return readLocal();
      }
      const merged: UIPreferences = data
        ? {
            theme: data.theme ?? null,
            density: (data.density === "compact" ? "compact" : "comfortable") as Density,
            language: (data.language === "en" ? "en" : "it") as UILanguage,
            preferences: (data.preferences as Record<string, unknown>) || {},
          }
        : readLocal();
      writeLocal(merged);
      return merged;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async (patch: Partial<UIPreferences>) => {
      const current = query.data ?? DEFAULTS;
      const next: UIPreferences = { ...current, ...patch };
      writeLocal(next);
      if (!user) return next;
      // Risolvi l'internal id (la colonna user_id contiene quello, non auth.uid())
      const { data: internalId, error: idErr } = await supabase.rpc("get_user_id", { _auth_uid: user.id });
      if (idErr || !internalId) {
        if (import.meta.env.DEV) console.debug("[useUIPreferences] get_user_id error", idErr?.message);
        return next;
      }
      const { error } = await supabase
        .from("user_ui_preferences")
        .upsert(
          {
            user_id: internalId as string,
            theme: next.theme,
            density: next.density,
            language: next.language,
            preferences: next.preferences as never,
          },
          { onConflict: "user_id" }
        );
      if (error && import.meta.env.DEV) console.debug("[useUIPreferences] upsert error", error.message);
      return next;
    },
    onSuccess: (next) => {
      qc.setQueryData(["ui-preferences", user?.id], next);
    },
  });

  return {
    prefs: query.data ?? DEFAULTS,
    isLoading: query.isLoading,
    update: mutation.mutate,
  };
}

/**
 * Applies density to <html data-density="..."> as soon as the prefs are known.
 */
export function useApplyDensity(density: Density) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-density", density);
  }, [density]);
}
