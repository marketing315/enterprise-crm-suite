import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Copy, Plus, Trash2, KeyRound, AlertCircle, Check } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const MCP_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;

const SCOPE_PRESETS = [
  { value: "crm.read", label: "Sola lettura CRM" },
  { value: "crm.write", label: "Lettura + scrittura CRM" },
  { value: "*", label: "Tutto (sconsigliato)" },
];

type Token = {
  id: string;
  name: string;
  kind: "user" | "service";
  token_prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

export function McpConnectionsTab() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("crm.read");
  const [kind, setKind] = useState<"user" | "service">("user");
  const [copied, setCopied] = useState(false);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["mcp-access-tokens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcp_access_tokens")
        .select("id,name,kind,token_prefix,scopes,expires_at,last_used_at,created_at,revoked_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Token[];
    },
  });

  const issueMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("issue_mcp_token", {
        p_name: name.trim(),
        p_kind: kind,
        p_scopes: [scope],
        p_expires_at: null,
        p_brand_id: null,
      });
      if (error) throw error;
      return data?.[0] as { token: string; token_id: string; prefix: string };
    },
    onSuccess: (data) => {
      setCreatedToken(data.token);
      qc.invalidateQueries({ queryKey: ["mcp-access-tokens"] });
      toast.success("Token creato — copia subito il valore");
    },
    onError: (e: any) => toast.error(`Errore: ${e.message}`),
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("revoke_mcp_token", { p_token_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mcp-access-tokens"] });
      toast.success("Token revocato");
    },
    onError: (e: any) => toast.error(`Errore: ${e.message}`),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copia non riuscita");
    }
  };

  const claudeConfig = createdToken
    ? JSON.stringify({
        mcpServers: {
          "ralph-crm": {
            url: MCP_ENDPOINT,
            headers: { Authorization: `Bearer ${createdToken}` },
          },
        },
      }, null, 2)
    : "";

  const handleClose = () => {
    setDialogOpen(false);
    setCreatedToken(null);
    setName("");
    setScope("crm.read");
    setKind("user");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Endpoint MCP</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              URL del server MCP da configurare nei tuoi client AI (Claude Desktop, Cursor, n8n).
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
            <code className="flex-1 truncate">{MCP_ENDPOINT}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(MCP_ENDPOINT)}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Token di accesso</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Un token per ogni client. Il valore è mostrato una sola volta — conservalo subito.
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuovo token
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : tokens.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessun token. Crea il primo per collegare un client MCP.
            </p>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => {
                const revoked = !!t.revoked_at;
                const expired = t.expires_at && new Date(t.expires_at) < new Date();
                return (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                      revoked || expired ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <KeyRound className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{t.name}</span>
                          <Badge variant="outline" className="text-[10px]">{t.kind}</Badge>
                          {revoked && <Badge variant="destructive" className="text-[10px]">revocato</Badge>}
                          {expired && !revoked && <Badge variant="secondary" className="text-[10px]">scaduto</Badge>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <code>{t.token_prefix}…</code>
                          <span>•</span>
                          <span>{t.scopes.join(", ")}</span>
                          {t.last_used_at && (
                            <>
                              <span>•</span>
                              <span>uso {format(new Date(t.last_used_at), "d MMM HH:mm", { locale: it })}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {!revoked && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Revocare il token "${t.name}"?`)) revokeMut.mutate(t.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{createdToken ? "Token creato" : "Nuovo token MCP"}</DialogTitle>
            <DialogDescription>
              {createdToken
                ? "Copia subito il valore: non sarà più visibile."
                : "Genera una credenziale per un client MCP esterno."}
            </DialogDescription>
          </DialogHeader>

          {!createdToken ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Claude Desktop / n8n prod / …"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scope">Scope</Label>
                <select
                  id="scope"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  {SCOPE_PRESETS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kind">Tipo</Label>
                <select
                  id="kind"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "user" | "service")}
                >
                  <option value="user">Utente (eredita i tuoi permessi)</option>
                  <option value="service">Service (machine-to-machine, solo admin)</option>
                </select>
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Le chiamate sono comunque filtrate dal Policy Engine MCP. Il token è una porta d'ingresso, non un bypass.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Token (visibile solo ora)</Label>
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
                  <code className="flex-1 break-all">{createdToken}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(createdToken)}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Configurazione Claude Desktop / Cursor</Label>
                <div className="rounded-md border bg-muted/30 p-3">
                  <pre className="overflow-x-auto text-[11px] leading-relaxed">{claudeConfig}</pre>
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => copy(claudeConfig)}>
                    <Copy className="mr-1.5 h-3 w-3" /> Copia config
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {!createdToken ? (
              <>
                <Button variant="ghost" onClick={handleClose}>Annulla</Button>
                <Button
                  onClick={() => issueMut.mutate()}
                  disabled={!name.trim() || issueMut.isPending}
                >
                  {issueMut.isPending ? "Creazione…" : "Crea token"}
                </Button>
              </>
            ) : (
              <Button onClick={handleClose}>Ho copiato</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
