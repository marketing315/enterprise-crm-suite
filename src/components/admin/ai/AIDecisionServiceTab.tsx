import { useState } from "react";
import { useAIConfig, useUpdateAIConfig, useAIPrompts, useCreateAIPrompt, useActivateAIPrompt } from "@/hooks/useAIConfig";
import { useBrand } from "@/contexts/BrandContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Zap,
  Play,
  Pause,
  Power,
  Plus,
  Check,
  Copy,
  RotateCcw,
  FileText,
} from "lucide-react";

export function AIDecisionServiceTab() {
  const { currentBrand } = useBrand();
  const { data: config, isLoading: loadingConfig } = useAIConfig();
  const { data: prompts = [], isLoading: loadingPrompts } = useAIPrompts("decision_service");
  const updateConfig = useUpdateAIConfig();
  const createPrompt = useCreateAIPrompt();
  const activatePrompt = useActivateAIPrompt();

  const [showNewPromptDialog, setShowNewPromptDialog] = useState(false);
  const [newPromptVersion, setNewPromptVersion] = useState("");
  const [newPromptContent, setNewPromptContent] = useState("");

  const handleModeChange = (mode: "off" | "suggest" | "auto_apply") => {
    if (!config) return;
    updateConfig.mutate({ id: config.id, updates: { mode } });
  };

  const handleCreatePrompt = () => {
    if (!currentBrand?.id || !newPromptVersion || !newPromptContent) return;

    createPrompt.mutate(
      {
        brand_id: currentBrand.id,
        name: "decision_service",
        version: newPromptVersion,
        content: newPromptContent,
        is_active: false,
      },
      {
        onSuccess: () => {
          setShowNewPromptDialog(false);
          setNewPromptVersion("");
          setNewPromptContent("");
        },
      }
    );
  };

  const handleDuplicatePrompt = (prompt: { version: string; content: string }) => {
    const versionParts = prompt.version.split(".");
    const lastPart = parseInt(versionParts[versionParts.length - 1] || "0", 10);
    versionParts[versionParts.length - 1] = String(lastPart + 1);
    setNewPromptVersion(versionParts.join("."));
    setNewPromptContent(prompt.content);
    setShowNewPromptDialog(true);
  };

  const activePrompt = prompts.find((p) => p.is_active);

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Modalità AI
          </CardTitle>
          <CardDescription>
            Configura come l'AI gestisce le decisioni per questo brand
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingConfig ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <button
                onClick={() => handleModeChange("off")}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                  config?.mode === "off"
                    ? "border-destructive bg-destructive/10"
                    : "border-muted hover:border-muted-foreground/30"
                }`}
              >
                <Power className={`h-8 w-8 ${config?.mode === "off" ? "text-destructive" : "text-muted-foreground"}`} />
                <span className="font-medium">OFF</span>
                <span className="text-xs text-muted-foreground text-center">
                  AI disattivata
                </span>
              </button>

              <button
                onClick={() => handleModeChange("suggest")}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                  config?.mode === "suggest"
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-muted hover:border-muted-foreground/30"
                }`}
              >
                <Pause className={`h-8 w-8 ${config?.mode === "suggest" ? "text-amber-500" : "text-muted-foreground"}`} />
                <span className="font-medium">Suggest-only</span>
                <span className="text-xs text-muted-foreground text-center">
                  Suggerisce ma non applica
                </span>
              </button>

              <button
                onClick={() => handleModeChange("auto_apply")}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                  config?.mode === "auto_apply"
                    ? "border-green-500 bg-green-500/10"
                    : "border-muted hover:border-muted-foreground/30"
                }`}
              >
                <Play className={`h-8 w-8 ${config?.mode === "auto_apply" ? "text-green-500" : "text-muted-foreground"}`} />
                <span className="font-medium">Auto-apply</span>
                <span className="text-xs text-muted-foreground text-center">
                  Applica automaticamente
                </span>
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prompt Versioning */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Prompt Versioning
            </CardTitle>
            <CardDescription>
              Gestisci le versioni del prompt per il Decision Service
            </CardDescription>
          </div>
          <Button size="sm" className="gap-2" onClick={() => setShowNewPromptDialog(true)}>
            <Plus className="h-4 w-4" />
            Nuova versione
          </Button>
        </CardHeader>
        <CardContent>
          {loadingPrompts ? (
            <Skeleton className="h-48 w-full" />
          ) : prompts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessun prompt configurato</p>
              <p className="text-sm">Crea la prima versione del prompt</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Versione</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Data creazione</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prompts.map((prompt) => (
                    <TableRow key={prompt.id}>
                      <TableCell className="font-mono">v{prompt.version}</TableCell>
                      <TableCell>
                        {prompt.is_active ? (
                          <Badge variant="default" className="gap-1">
                            <Check className="h-3 w-3" />
                            Attivo
                          </Badge>
                        ) : (
                          <Badge variant="outline">Inattivo</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(prompt.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDuplicatePrompt(prompt)}
                          title="Duplica e modifica"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {!prompt.is_active && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => activatePrompt.mutate(prompt.id)}
                            title="Attiva"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Active Prompt Preview */}
      {activePrompt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prompt attivo (v{activePrompt.version})</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto max-h-[300px] whitespace-pre-wrap">
              {activePrompt.content}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Deterministic Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Regole deterministiche
          </CardTitle>
          <CardDescription>
            Regole applicate prima del LLM (senza costo AI)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <span className="font-medium">Opt-out → Archivia</span>
                <p className="text-sm text-muted-foreground">
                  Se archived_optout, non creare ticket/appuntamento
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <span className="font-medium">Telefono mancante → Da verificare</span>
                <p className="text-sm text-muted-foreground">
                  Tag "da_verificare" e priorità bassa
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <span className="font-medium">WhatsApp + "assistenza" → Support</span>
                <p className="text-sm text-muted-foreground">
                  Classifica automaticamente come lead_type assistenza
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* New Prompt Dialog */}
      <Dialog open={showNewPromptDialog} onOpenChange={setShowNewPromptDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuova versione prompt</DialogTitle>
            <DialogDescription>
              Crea una nuova versione del prompt per il Decision Service
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="version">Versione</Label>
              <Input
                id="version"
                placeholder="es. 2.1"
                value={newPromptVersion}
                onChange={(e) => setNewPromptVersion(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Contenuto prompt</Label>
              <Textarea
                id="content"
                placeholder="Inserisci il contenuto del prompt..."
                className="min-h-[300px] font-mono text-sm"
                value={newPromptContent}
                onChange={(e) => setNewPromptContent(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewPromptDialog(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleCreatePrompt}
              disabled={!newPromptVersion || !newPromptContent || createPrompt.isPending}
            >
              {createPrompt.isPending ? "Salvataggio..." : "Salva prompt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
