import { useEffect, useState } from "react";
import { Link2, Loader2, Unlink, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Identity = {
  id: string;
  provider: string;
  identity_data?: Record<string, unknown> | null;
  created_at?: string;
};

const SUPPORTED = ["google", "apple"] as const;
type SupportedProvider = (typeof SUPPORTED)[number];

const LABELS: Record<SupportedProvider, string> = {
  google: "Google",
  apple: "Apple",
};

/**
 * §6.4 — Identity linking.
 *
 * Mostra le identità collegate all'utente e permette di:
 *   - collegare Google / Apple via supabase.auth.linkIdentity (richiede email verificata dal provider)
 *   - scollegare un provider (mai l'ultima identity, mai se è l'unico metodo)
 *
 * Policy: l'auto-link è gestito server-side da Supabase solo per provider che
 * verificano l'email. Mai per email non verificate (anti account-takeover).
 */
export function IdentityLinkingCard() {
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      setIdentities((data?.identities ?? []) as Identity[]);
    } catch (e) {
      console.warn("[identity] list failed", e);
      setIdentities([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const link = async (provider: SupportedProvider) => {
    setBusy(provider);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: `${window.location.origin}/settings/security` },
      });
      if (error) throw error;
      // redirect avviene → niente toast
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Collegamento ${LABELS[provider]} non riuscito: ${msg}`);
      setBusy(null);
    }
  };

  const unlink = async (identity: Identity) => {
    if (!identities || identities.length <= 1) {
      toast.error("Non puoi scollegare l'unico metodo di accesso.");
      return;
    }
    setBusy(identity.id);
    try {
      const { error } = await supabase.auth.unlinkIdentity(
        identity as Parameters<typeof supabase.auth.unlinkIdentity>[0],
      );
      if (error) throw error;
      toast.success(`${LABELS[identity.provider as SupportedProvider] ?? identity.provider} scollegato`);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Scollegamento non riuscito: ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  const linkedProviders = new Set((identities ?? []).map((i) => i.provider));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" />
          Account collegati
        </CardTitle>
        <CardDescription>
          Collega Google o Apple per accedere più velocemente. Il collegamento è consentito solo se il
          provider ha verificato il tuo indirizzo email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento…
          </div>
        ) : (
          <>
            <ul className="divide-y rounded-md border">
              {(identities ?? []).map((id) => (
                <li key={id.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      {LABELS[id.provider as SupportedProvider] ?? id.provider}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {(id.identity_data?.email as string) ?? id.id}
                    </div>
                  </div>
                  {id.provider !== "email" && (identities?.length ?? 0) > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void unlink(id)}
                      disabled={busy === id.id}
                    >
                      {busy === id.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Unlink className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </li>
              ))}
              {(identities?.length ?? 0) === 0 && (
                <li className="px-3 py-3 text-sm text-muted-foreground">Nessuna identità rilevata.</li>
              )}
            </ul>

            <div className="flex flex-wrap gap-2 pt-1">
              {SUPPORTED.filter((p) => !linkedProviders.has(p)).map((p) => (
                <Button
                  key={p}
                  variant="outline"
                  size="sm"
                  onClick={() => void link(p)}
                  disabled={busy === p}
                >
                  {busy === p ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="mr-2 h-4 w-4" />
                  )}
                  Collega {LABELS[p]}
                </Button>
              ))}
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Per evitare account takeover, il collegamento avviene solo se il provider conferma
                l'email. Non è possibile scollegare l'unico metodo di accesso.
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}
