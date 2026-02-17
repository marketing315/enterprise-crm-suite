import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { supabase } from "@/integrations/supabase/client";
import { untypedClient } from "@/integrations/supabase/untypedClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ExternalLink, Loader2, RefreshCw, Trash2, Plug } from "lucide-react";
import { format, isPast, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";

interface OAuthToken {
  id: string;
  brand_id: string;
  provider: string;
  account_id: string;
  expires_at: string;
  scopes: string[] | null;
  created_at: string;
  updated_at: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
};

export function OAuthChannelsSettings() {
  const { hasRole } = useAuth();
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);

  const isAdmin = currentBrand ? hasRole("admin", currentBrand.id) : false;
  const isCeo = hasRole("ceo");

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["oauth-tokens", currentBrand?.id],
    queryFn: async (): Promise<OAuthToken[]> => {
      if (!currentBrand) return [];
      const { data, error } = await untypedClient
        .from("oauth_tokens")
        .select("id, brand_id, provider, account_id, expires_at, scopes, created_at, updated_at")
        .eq("brand_id", currentBrand.id)
        .order("provider");
      if (error) throw error;
      return (data || []) as OAuthToken[];
    },
    enabled: !!currentBrand && (isAdmin || isCeo),
  });

  const connectMutation = useMutation({
    mutationFn: async (provider: "google" | "meta") => {
      const fnName = provider === "google" ? "google-oauth-start" : "meta-oauth-start";
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { brand_id: currentBrand?.id },
      });
      if (error) throw error;
      if (data?.auth_url) {
        window.top?.location.assign(data.auth_url);
      } else {
        throw new Error("auth_url non ricevuto");
      }
    },
    onError: (err: Error) => {
      toast.error(`Errore connessione: ${err.message}`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const { error } = await untypedClient
        .from("oauth_tokens")
        .delete()
        .eq("id", tokenId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account scollegato");
      queryClient.invalidateQueries({ queryKey: ["oauth-tokens"] });
    },
    onError: (err: Error) => {
      toast.error(`Errore: ${err.message}`);
    },
  });

  if (!isAdmin && !isCeo) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Solo gli amministratori e i CEO possono gestire le connessioni OAuth.
        </AlertDescription>
      </Alert>
    );
  }

  const handleSync = async (provider: string) => {
    setSyncingProvider(provider);
    try {
      const fnName = provider === "google_ads" ? "google-ads-sync" : "ads-stats-meta";
      const { error } = await supabase.functions.invoke(fnName);
      if (error) throw error;
      toast.success(`Sincronizzazione ${PROVIDER_LABELS[provider]} completata`);
    } catch (err: any) {
      toast.error(`Errore sync: ${err.message}`);
    } finally {
      setSyncingProvider(null);
    }
  };

  const getExpiryBadge = (expiresAt: string) => {
    const expDate = new Date(expiresAt);
    if (isPast(expDate)) {
      return <Badge variant="destructive">Scaduto</Badge>;
    }
    const daysLeft = differenceInDays(expDate, new Date());
    if (daysLeft <= 7) {
      return <Badge variant="secondary">Scade tra {daysLeft}g</Badge>;
    }
    return <Badge variant="outline">Attivo</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          Canali OAuth - Ads
        </CardTitle>
        <CardDescription>
          Collega account pubblicitari Google e Meta per la sincronizzazione automatica dei dati.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => connectMutation.mutate("google")}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Collega Google Ads
          </Button>
          <Button
            variant="outline"
            onClick={() => connectMutation.mutate("meta")}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Collega Meta Ads
          </Button>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium mb-3">Account collegati</h3>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Caricamento...
            </div>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nessun account collegato. Usa i pulsanti sopra per connettere un account.
            </p>
          ) : (
            <div className="space-y-3">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {PROVIDER_LABELS[token.provider] || token.provider}
                      </span>
                      {getExpiryBadge(token.expires_at)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Account: {token.account_id} · Scadenza:{" "}
                      {format(new Date(token.expires_at), "dd MMM yyyy HH:mm", { locale: it })}
                    </div>
                    {token.scopes && (
                      <div className="text-xs text-muted-foreground">
                        Scope: {token.scopes.join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSync(token.provider)}
                      disabled={syncingProvider === token.provider}
                    >
                      {syncingProvider === token.provider ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Sei sicuro di voler scollegare questo account?")) {
                          disconnectMutation.mutate(token.id);
                        }
                      }}
                      disabled={disconnectMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            I token sono archiviati in modo sicuro. La sincronizzazione automatica avviene ogni minuto per i dati recenti.
            Per importare dati storici, usa la sezione "Ad Stats" nel marketing.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
