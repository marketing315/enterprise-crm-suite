import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Link2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useMetaPagesAvailable } from "@/hooks/useMetaPagesAvailable";

interface MetaPageConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MetaPageConnectDialog({ open, onOpenChange }: MetaPageConnectDialogProps) {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();
  const [selectedPage, setSelectedPage] = useState<string>("");
  const [selectedAdAccount, setSelectedAdAccount] = useState<string>("none");
  const [search, setSearch] = useState("");

  const brandId = currentBrand?.id ?? null;
  const { data, error, isLoading, refetch } = useMetaPagesAvailable(brandId, open);

  const filteredPages = useMemo(() => {
    if (!data?.pages) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.pages;
    return data.pages.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
    );
  }, [data?.pages, search]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!brandId || !selectedPage) throw new Error("missing_selection");
      const { data: res, error: err } = await supabase.functions.invoke("meta-connect-page", {
        body: {
          brand_id: brandId,
          page_id: selectedPage,
          ad_account_id: selectedAdAccount === "none" ? undefined : selectedAdAccount,
        },
      });
      if (err) {
        const ctx = (err as { context?: Response }).context;
        if (ctx) {
          try {
            const json = await ctx.json();
            throw new Error(json?.message ?? json?.error ?? err.message);
          } catch (e) {
            throw e instanceof Error ? e : new Error(err.message);
          }
        }
        throw err;
      }
      if (res && (res as { error?: string }).error) {
        throw new Error((res as { message?: string; error?: string }).message ?? (res as { error: string }).error);
      }
      return res as { ok: boolean; page_name: string; subscribed: boolean };
    },
    onSuccess: (res) => {
      toast.success(`Pagina "${res.page_name}" collegata${res.subscribed ? " (webhook leadgen attivato)" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["meta-apps"] });
      onOpenChange(false);
      setSelectedPage("");
      setSelectedAdAccount("none");
      setSearch("");
    },
    onError: (e: Error) => {
      toast.error(`Collegamento fallito: ${e.message}`);
    },
  });

  const oauthNotCompleted = error?.error === "oauth_not_completed";

  const startOAuth = async () => {
    if (!brandId) return;
    try {
      const { data: res, error: err } = await supabase.functions.invoke<{ url?: string; auth_url?: string }>(
        "meta-oauth-start",
        { body: { brand_id: brandId } },
      );
      if (err) throw err;
      const url = res?.url ?? res?.auth_url;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else toast.error("URL OAuth non ricevuto");
    } catch (e) {
      toast.error(`Avvio OAuth fallito: ${(e as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Collega pagina Facebook</DialogTitle>
          <DialogDescription>
            Seleziona una pagina che vuoi connettere al brand <strong>{currentBrand?.name}</strong>.
            Il webhook leadgen verrà attivato automaticamente.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {oauthNotCompleted && (
          <Alert className="my-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="space-y-3">
              <p>Devi prima autenticarti con Facebook per questo brand.</p>
              <Button size="sm" onClick={startOAuth}>
                <Link2 className="h-4 w-4 mr-2" />
                Connetti Meta (OAuth)
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {error && !oauthNotCompleted && (
          <Alert variant="destructive" className="my-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error.message ?? error.error}
              <Button variant="link" size="sm" onClick={() => refetch()} className="ml-2">
                Riprova
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {data && data.pages.length === 0 && (
          <Alert className="my-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Nessuna pagina disponibile. Verifica gli scope concessi (pages_show_list)
              e che il tuo account Facebook gestisca almeno una pagina.
            </AlertDescription>
          </Alert>
        )}

        {data && data.pages.length > 0 && (
          <div className="space-y-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca pagina per nome o ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="border rounded-lg max-h-[280px] overflow-y-auto">
              <RadioGroup value={selectedPage} onValueChange={setSelectedPage}>
                {filteredPages.map((p) => (
                  <Label
                    key={p.id}
                    htmlFor={`page-${p.id}`}
                    className="flex items-center gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <RadioGroupItem id={`page-${p.id}`} value={p.id} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {p.id}{p.category ? ` · ${p.category}` : ""}
                      </div>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {data.ad_accounts.length > 0 && (
              <div className="space-y-2">
                <Label>Ad Account (opzionale)</Label>
                <Select value={selectedAdAccount} onValueChange={setSelectedAdAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nessuno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuno</SelectItem>
                    {data.ad_accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} <span className="text-muted-foreground">({a.id})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se selezioni un Ad Account, verrà abilitato l'import statistiche ADV.
                </p>
              </div>
            )}

            {data.warnings?.length ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Avvisi Graph API: {data.warnings.map((w) => w.message).filter(Boolean).join("; ")}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={() => connectMutation.mutate()}
            disabled={!selectedPage || connectMutation.isPending}
          >
            {connectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Link2 className="h-4 w-4 mr-2" />
            Collega pagina
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
