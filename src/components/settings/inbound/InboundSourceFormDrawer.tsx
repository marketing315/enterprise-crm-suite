import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Copy, Key, Shield } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Nome richiesto").max(100),
  description: z.string().max(500).optional(),
  rate_limit_per_min: z.coerce.number().min(1).max(1000).default(60),
  hmac_enabled: z.boolean().default(false),
  replay_window_seconds: z.coerce.number().min(60).max(3600).default(300),
});

type FormValues = z.infer<typeof formSchema>;

interface InboundSourceFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSource?: {
    id: string;
    name: string;
    description: string | null;
    rate_limit_per_min: number;
    hmac_enabled?: boolean;
    replay_window_seconds?: number;
  } | null;
}

// Generate a secure random API key
function generateApiKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Hash API key for storage (matching edge function logic)
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function InboundSourceFormDrawer({
  open,
  onOpenChange,
  editingSource,
}: InboundSourceFormDrawerProps) {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      rate_limit_per_min: 60,
      hmac_enabled: false,
      replay_window_seconds: 300,
    },
  });

  useEffect(() => {
    if (editingSource) {
      form.reset({
        name: editingSource.name,
        description: editingSource.description || "",
        rate_limit_per_min: editingSource.rate_limit_per_min,
        hmac_enabled: editingSource.hmac_enabled ?? false,
        replay_window_seconds: editingSource.replay_window_seconds ?? 300,
      });
    } else {
      form.reset({
        name: "",
        description: "",
        rate_limit_per_min: 60,
        hmac_enabled: false,
        replay_window_seconds: 300,
      });
    }
    setGeneratedApiKey(null);
  }, [editingSource, form, open]);

  const hmacEnabled = form.watch("hmac_enabled");

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!currentBrand?.id) throw new Error("No brand selected");
      
      const apiKey = generateApiKey();
      const apiKeyHash = await hashApiKey(apiKey);

      // If HMAC is enabled, we'll use the same API key as the HMAC secret
      // This simplifies key management - one key for auth + signing
      const hmacSecretHash = values.hmac_enabled ? apiKeyHash : null;

      const { error } = await supabase.from("webhook_sources").insert({
        brand_id: currentBrand.id,
        name: values.name,
        description: values.description || null,
        rate_limit_per_min: values.rate_limit_per_min,
        api_key_hash: apiKeyHash,
        is_active: true,
        hmac_enabled: values.hmac_enabled,
        hmac_secret_hash: hmacSecretHash,
        replay_window_seconds: values.replay_window_seconds,
      });

      if (error) throw error;
      return { apiKey, hmacEnabled: values.hmac_enabled };
    },
    onSuccess: (result) => {
      setGeneratedApiKey(result.apiKey);
      queryClient.invalidateQueries({ queryKey: ["inbound-sources"] });
      toast.success("Sorgente creata");
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!editingSource?.id) throw new Error("No source to edit");

      const { error } = await supabase
        .from("webhook_sources")
        .update({
          name: values.name,
          description: values.description || null,
          rate_limit_per_min: values.rate_limit_per_min,
          hmac_enabled: values.hmac_enabled,
          replay_window_seconds: values.replay_window_seconds,
        })
        .eq("id", editingSource.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbound-sources"] });
      toast.success("Sorgente aggiornata");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  const handleSubmit = (values: FormValues) => {
    if (editingSource) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const handleCopyApiKey = () => {
    if (generatedApiKey) {
      navigator.clipboard.writeText(generatedApiKey);
      toast.success("API Key copiata");
    }
  };

  const handleClose = () => {
    setGeneratedApiKey(null);
    onOpenChange(false);
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {editingSource ? "Modifica Sorgente" : "Nuova Sorgente Inbound"}
          </SheetTitle>
          <SheetDescription>
            {editingSource
              ? "Modifica i dettagli della sorgente webhook"
              : "Configura una nuova sorgente per ricevere lead via webhook"}
          </SheetDescription>
        </SheetHeader>

        {generatedApiKey ? (
          <div className="mt-6 space-y-4">
            <Alert>
              <Key className="h-4 w-4" />
              <AlertDescription>
                <strong>Salva questa API Key!</strong> Non sarà più visibile dopo
                la chiusura di questo pannello.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <div className="flex gap-2">
                <Input
                  value={generatedApiKey}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="icon" onClick={handleCopyApiKey}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {hmacEnabled && (
              <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                <Shield className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                  <strong>HMAC attivo:</strong> Usa questa stessa API Key per firmare le richieste.
                  <br />
                  <code className="text-xs mt-1 block">
                    X-Signature: sha256=HMAC(apiKey, "timestamp.body")
                  </code>
                  <code className="text-xs block">
                    X-Timestamp: Unix timestamp (secondi)
                  </code>
                </AlertDescription>
              </Alert>
            )}
            
            <Button onClick={handleClose} className="w-full">
              Chiudi
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="mt-6 space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="es. Meta Ads, Keplero..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrizione (opzionale)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Note sulla sorgente..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rate_limit_per_min"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate Limit (req/min)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={1000} {...field} />
                    </FormControl>
                    <FormDescription>
                      Massimo numero di richieste al minuto
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator className="my-4" />

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Sicurezza Avanzata</span>
                </div>

                <FormField
                  control={form.control}
                  name="hmac_enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Verifica HMAC
                        </FormLabel>
                        <FormDescription>
                          Richiedi firma HMAC-SHA256 + timestamp anti-replay
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {hmacEnabled && (
                  <FormField
                    control={form.control}
                    name="replay_window_seconds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Finestra Anti-Replay (secondi)</FormLabel>
                        <FormControl>
                          <Input type="number" min={60} max={3600} {...field} />
                        </FormControl>
                        <FormDescription>
                          Tolleranza temporale per timestamp (60-3600s, default 300s = 5 min)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1"
                >
                  Annulla
                </Button>
                <Button type="submit" disabled={isLoading} className="flex-1">
                  {isLoading
                    ? "Salvataggio..."
                    : editingSource
                    ? "Salva"
                    : "Crea"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </SheetContent>
    </Sheet>
  );
}
