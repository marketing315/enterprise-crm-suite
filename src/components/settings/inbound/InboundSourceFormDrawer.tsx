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
import { Copy, Key } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Nome richiesto").max(100),
  description: z.string().max(500).optional(),
  rate_limit_per_min: z.coerce.number().min(1).max(1000).default(60),
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
    },
  });

  useEffect(() => {
    if (editingSource) {
      form.reset({
        name: editingSource.name,
        description: editingSource.description || "",
        rate_limit_per_min: editingSource.rate_limit_per_min,
      });
    } else {
      form.reset({
        name: "",
        description: "",
        rate_limit_per_min: 60,
      });
    }
    setGeneratedApiKey(null);
  }, [editingSource, form, open]);

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!currentBrand?.id) throw new Error("No brand selected");
      
      const apiKey = generateApiKey();
      const apiKeyHash = await hashApiKey(apiKey);

      const { error } = await supabase.from("webhook_sources").insert({
        brand_id: currentBrand.id,
        name: values.name,
        description: values.description || null,
        rate_limit_per_min: values.rate_limit_per_min,
        api_key_hash: apiKeyHash,
        is_active: true,
      });

      if (error) throw error;
      return apiKey;
    },
    onSuccess: (apiKey) => {
      setGeneratedApiKey(apiKey);
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
      <SheetContent className="sm:max-w-md">
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
