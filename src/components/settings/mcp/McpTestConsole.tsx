import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Play, FlaskConical, Loader2, Copy, CheckCircle, XCircle, ShieldAlert } from "lucide-react";
import { useMcpServers, useMcpTools } from "@/hooks/useMcpData";
import { supabase } from "@/integrations/supabase/client";

interface TestResult {
  status: string;
  execution_id?: string;
  result?: unknown;
  error?: string;
  latency_ms?: number;
  policy_id?: string;
  dry_run?: boolean;
}

export function McpTestConsole() {
  const { data: servers = [] } = useMcpServers();
  const { data: tools = [] } = useMcpTools();
  const [selectedTool, setSelectedTool] = useState("");
  const [brandId, setBrandId] = useState("");
  const [inputJson, setInputJson] = useState("{}");
  const [dryRun, setDryRun] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const getToolFullName = useCallback((toolId: string) => {
    const tool = tools.find(t => t.id === toolId);
    if (!tool) return "";
    const server = servers.find(s => s.id === tool.server_id);
    const prefix = server?.name?.toLowerCase().replace(/\s+/g, "-") ?? "unknown";
    return `${prefix}.${tool.name}`;
  }, [tools, servers]);

  const handleExecute = async () => {
    if (!selectedTool) {
      toast.error("Seleziona un tool");
      return;
    }

    let parsedInput: Record<string, unknown>;
    try {
      parsedInput = JSON.parse(inputJson);
    } catch {
      toast.error("JSON input non valido");
      return;
    }

    setIsRunning(true);
    setResult(null);

    try {
      const toolName = getToolFullName(selectedTool);
      const requestId = crypto.randomUUID();

      if (dryRun) {
        // Dry-run: simulate policy check locally without execution
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          setResult({ status: "error", error: "Non autenticato" });
          return;
        }

        const { data, error } = await supabase.functions.invoke("mcp-gateway", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        // For dry-run we just show what the policy engine would do
        // We check policies client-side for now
        const { data: policies } = await supabase.from("mcp_policies")
          .select("*")
          .eq("enabled", true)
          .order("priority", { ascending: false });

        const { data: userData } = await supabase
          .from("users")
          .select("id")
          .eq("supabase_auth_id", session.session.user.id)
          .maybeSingle();

        const { data: roles } = await supabase.from("user_roles")
          .select("role")
          .eq("user_id", userData?.id ?? "");

        const userRoles = (roles ?? []).map((r) => r.role);

        // Simple policy match simulation
        let decision = "deny";
        let matchedPolicyId: string | null = null;
        const sorted = [...(policies ?? [])].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

        for (const p of sorted) {
          if (p.role !== "*" && !userRoles.includes(p.role as string)) continue;
          if (p.brand_scope && p.brand_scope !== brandId) continue;
          const pattern = p.tool_pattern === "*" ? ".*" : p.tool_pattern.replace(/\*/g, ".*");
          if (!new RegExp(`^${pattern}$`).test(toolName)) continue;

          if (p.action === "deny") {
            decision = "deny";
            matchedPolicyId = p.id;
            break;
          }
          decision = p.action;
          matchedPolicyId = p.id;
          break;
        }

        setResult({
          status: decision === "allow" ? "would_execute" : decision === "deny" ? "would_deny" : "would_require_approval",
          dry_run: true,
          policy_id: matchedPolicyId ?? undefined,
          result: {
            tool: toolName,
            input: parsedInput,
            brand_id: brandId || null,
            user_roles: userRoles,
            matched_policies: sorted.filter((p: any) => {
              if (p.role !== "*" && !userRoles.includes(p.role)) return false;
              const pattern = p.tool_pattern === "*" ? ".*" : p.tool_pattern.replace(/\*/g, ".*");
              return new RegExp(`^${pattern}$`).test(toolName);
            }).map((p: any) => ({ id: p.id, role: p.role, action: p.action, priority: p.priority })),
          },
        });
      } else {
        // Real execution via gateway
        const { data, error } = await supabase.functions.invoke("mcp-gateway/execute-tool", {
          body: {
            request_id: requestId,
            tool: toolName,
            brand_id: brandId || undefined,
            input: parsedInput,
            idempotency_key: crypto.randomUUID(),
          },
        });

        if (error) {
          setResult({ status: "error", error: error.message });
        } else {
          setResult(data as TestResult);
        }
      }
    } catch (err) {
      setResult({ status: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsRunning(false);
    }
  };

  const statusIcon = result?.status === "success" || result?.status === "would_execute"
    ? <CheckCircle className="h-4 w-4 text-green-500" />
    : result?.status === "would_deny" || result?.status === "denied"
    ? <XCircle className="h-4 w-4 text-destructive" />
    : result?.status === "would_require_approval" || result?.status === "pending_approval"
    ? <ShieldAlert className="h-4 w-4 text-yellow-500" />
    : <XCircle className="h-4 w-4 text-destructive" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5" /> Test Console
        </CardTitle>
        <CardDescription>
          Testa i tool MCP con dry-run (solo policy check) o esecuzione reale.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Tool Selection */}
          <div className="space-y-2">
            <Label>Tool</Label>
            <Select value={selectedTool} onValueChange={setSelectedTool}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona tool..." />
              </SelectTrigger>
              <SelectContent>
                {tools.map(t => {
                  const serverName = servers.find(s => s.id === t.server_id)?.name ?? "";
                  return (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="font-mono text-xs">{serverName}.{t.name}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Brand ID */}
          <div className="space-y-2">
            <Label>Brand ID (opzionale)</Label>
            <Input
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              placeholder="UUID del brand..."
              className="font-mono text-xs"
            />
          </div>
        </div>

        {/* Input JSON */}
        <div className="space-y-2">
          <Label>Input JSON</Label>
          <textarea
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            className="w-full h-24 rounded-md border bg-muted/30 p-3 font-mono text-xs resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder='{ "ticket_id": "...", "status": "in_progress" }'
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Switch checked={dryRun} onCheckedChange={setDryRun} />
            <Label className="text-sm">
              {dryRun ? (
                <span className="flex items-center gap-1.5">
                  <FlaskConical className="h-3.5 w-3.5" /> Dry Run (solo policy check)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-destructive">
                  <Play className="h-3.5 w-3.5" /> Esecuzione reale
                </span>
              )}
            </Label>
          </div>
          <Button onClick={handleExecute} disabled={isRunning || !selectedTool}>
            {isRunning ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Esecuzione...</>
            ) : dryRun ? (
              <><FlaskConical className="h-4 w-4 mr-1" /> Simula</>
            ) : (
              <><Play className="h-4 w-4 mr-1" /> Esegui</>
            )}
          </Button>
        </div>

        {/* Results */}
        {result && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon}
                  <Badge variant={
                    result.status === "success" || result.status === "would_execute" ? "default"
                    : result.status === "would_require_approval" || result.status === "pending_approval" ? "secondary"
                    : "destructive"
                  }>
                    {result.status}
                  </Badge>
                  {result.dry_run && <Badge variant="outline" className="text-xs">DRY RUN</Badge>}
                  {result.latency_ms && <span className="text-xs text-muted-foreground">{result.latency_ms}ms</span>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                    toast.success("Copiato");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>

              <ScrollArea className="h-48 rounded-md border bg-muted/20 p-3">
                <pre className="font-mono text-xs whitespace-pre-wrap">
                  {JSON.stringify(result.result ?? result.error ?? result, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
