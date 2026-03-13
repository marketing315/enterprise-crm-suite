import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Copy } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useMetaApps, MetaApp, generateVerifyToken } from "@/hooks/useMetaApps";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/copyToClipboard";

const formSchema = z.object({
  brand_slug: z.string().min(1, "Brand slug richiesto").regex(/^[a-z0-9-]+$/, "Solo lettere minuscole, numeri e trattini"),
  verify_token: z.string().min(8, "Minimo 8 caratteri"),
  app_secret: z.string().min(1, "App Secret richiesto"),
  page_id: z.string().optional(),
  access_token: z.string().min(1, "Access Token richiesto"),
  is_active: z.boolean(),
  ad_account_id: z.string().optional(),
  stats_enabled: z.boolean(),
  // CAPI fields
  pixel_id: z.string().optional(),
  capi_token_key: z.string().optional(),
  capi_enabled: z.boolean(),
  capi_test_event_code: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface MetaAppFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingApp?: MetaApp | null;
}

export function MetaAppFormDrawer({ open, onOpenChange, editingApp }: MetaAppFormDrawerProps) {
  const { currentBrand } = useBrand();
  const { createMetaApp, updateMetaApp } = useMetaApps();
  const lastEditingIdRef = useRef<string | null | undefined>(undefined);
  const wasOpenRef = useRef(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      brand_slug: "",
      verify_token: "",
      app_secret: "",
      page_id: "",
      access_token: "",
      is_active: true,
      ad_account_id: "",
      stats_enabled: false,
      pixel_id: "",
      capi_token_key: "",
      capi_enabled: false,
      capi_test_event_code: "",
    },
  });
  useEffect(() => {
    // Only reset when drawer opens fresh or editingApp changes
    const isOpening = open && !wasOpenRef.current;
    const editingChanged = editingApp?.id !== lastEditingIdRef.current;
    
    if (isOpening || editingChanged) {
      if (editingApp) {
        form.reset({
          brand_slug: editingApp.brand_slug,
          verify_token: editingApp.verify_token,
          app_secret: editingApp.app_secret,
          page_id: editingApp.page_id || "",
          access_token: editingApp.access_token,
          is_active: editingApp.is_active,
          ad_account_id: (editingApp as Record<string, unknown>).ad_account_id as string || "",
          stats_enabled: (editingApp as Record<string, unknown>).stats_enabled === true,
          pixel_id: (editingApp as Record<string, unknown>).pixel_id as string || "",
          capi_token_key: (editingApp as Record<string, unknown>).capi_token_key as string || "",
          capi_enabled: (editingApp as Record<string, unknown>).capi_enabled === true,
          capi_test_event_code: (editingApp as Record<string, unknown>).capi_test_event_code as string || "",
        });
      } else if (isOpening) {
        // Only generate new token when opening fresh (not editing)
        form.reset({
          brand_slug: currentBrand?.slug || "",
          verify_token: generateVerifyToken(),
          app_secret: "",
          page_id: "",
          access_token: "",
          is_active: true,
          ad_account_id: "",
          stats_enabled: false,
          pixel_id: "",
          capi_token_key: "",
          capi_enabled: false,
          capi_test_event_code: "",
        });
      }
      lastEditingIdRef.current = editingApp?.id ?? null;
    }
    
    wasOpenRef.current = open;
  }, [editingApp, open, currentBrand, form]);
  const onSubmit = async (data: FormData) => {
    if (!currentBrand) return;

    try {
      if (editingApp) {
        await updateMetaApp.mutateAsync({
          id: editingApp.id,
          brand_slug: data.brand_slug,
          verify_token: data.verify_token,
          app_secret: data.app_secret,
          access_token: data.access_token,
          is_active: data.is_active,
          page_id: data.page_id || null,
          ad_account_id: data.ad_account_id || null,
          stats_enabled: data.stats_enabled,
          pixel_id: data.pixel_id || null,
          capi_token_key: data.capi_token_key || null,
          capi_enabled: data.capi_enabled,
          capi_test_event_code: data.capi_test_event_code || null,
        } as Record<string, unknown>);
      } else {
        await createMetaApp.mutateAsync({
          brand_id: currentBrand.id,
          brand_slug: data.brand_slug,
          verify_token: data.verify_token,
          app_secret: data.app_secret,
          access_token: data.access_token,
          is_active: data.is_active,
          page_id: data.page_id || undefined,
          ad_account_id: data.ad_account_id || undefined,
          stats_enabled: data.stats_enabled,
          pixel_id: data.pixel_id || undefined,
          capi_token_key: data.capi_token_key || undefined,
          capi_enabled: data.capi_enabled,
          capi_test_event_code: data.capi_test_event_code || undefined,
        } as any);
      }
      onOpenChange(false);
    } catch (error) {
      // Error handled in hook
    }
  };

  const regenerateToken = () => {
    const newToken = generateVerifyToken();
    form.setValue("verify_token", newToken);
    toast.info("Nuovo token generato");
  };

  const copyValue = (value: string, label: string) => {
    copyToClipboard(value, label);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {editingApp ? "Modifica Meta App" : "Nuova Meta App"}
          </SheetTitle>
          <SheetDescription>
            Configura l'integrazione Meta Lead Ads per questo brand
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">
            <FormField
              control={form.control}
              name="brand_slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand Slug</FormLabel>
                  <FormControl>
                    <Input placeholder="brand-name" {...field} />
                  </FormControl>
                  <FormDescription>
                    Identificatore univoco per il webhook URL
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="verify_token"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verify Token</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input {...field} readOnly className="font-mono text-sm" />
                    </FormControl>
                    <Button type="button" variant="outline" size="icon" onClick={regenerateToken}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => copyValue(field.value, "Verify Token")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <FormDescription>
                    Da inserire nella configurazione webhook di Meta
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="app_secret"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>App Secret</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Meta App Secret" {...field} />
                  </FormControl>
                  <FormDescription>
                    Trovalo in Meta Developer Console → App Settings
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="page_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Page ID (opzionale)</FormLabel>
                  <FormControl>
                    <Input placeholder="123456789" {...field} />
                  </FormControl>
                  <FormDescription>
                    ID della pagina Facebook collegata
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="access_token"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access Token</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="System User o Page Token" {...field} />
                  </FormControl>
                  <FormDescription>
                    Token con permessi leads_retrieval
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Attivo</FormLabel>
                    <FormDescription>
                      Abilita la ricezione di lead da Meta
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

            {/* ADV Stats Section */}
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-medium mb-4">Statistiche ADV (Import automatico)</h4>
              
              <FormField
                control={form.control}
                name="ad_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ad Account ID</FormLabel>
                    <FormControl>
                      <Input placeholder="act_123456789" {...field} />
                    </FormControl>
                    <FormDescription>
                      ID dell'Ad Account Meta per importare le statistiche
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stats_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4 mt-4">
                    <div className="space-y-0.5">
                      <FormLabel>Import Statistiche ADV</FormLabel>
                      <FormDescription>
                        Importa automaticamente spend, impression e click
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!form.watch("ad_account_id")}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* CAPI Section */}
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-medium mb-4">🔄 Conversions API (CAPI)</h4>
              <p className="text-xs text-muted-foreground mb-4">
                Invia eventi server-side a Meta per migliorare l'attribuzione delle conversioni.
              </p>
              
              <FormField
                control={form.control}
                name="pixel_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pixel ID</FormLabel>
                    <FormControl>
                      <Input placeholder="123456789" {...field} />
                    </FormControl>
                    <FormDescription>
                      ID del Pixel Meta (Events Manager → Pixel)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="capi_token_key"
                render={({ field }) => (
                  <FormItem className="mt-4">
                    <FormLabel>Token Secret Key</FormLabel>
                    <FormControl>
                      <Input placeholder="META_CAPI_TOKEN_BRAND1" {...field} />
                    </FormControl>
                    <FormDescription>
                      Nome della variabile ambiente contenente il token CAPI
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="capi_test_event_code"
                render={({ field }) => (
                  <FormItem className="mt-4">
                    <FormLabel>Test Event Code (opzionale)</FormLabel>
                    <FormControl>
                      <Input placeholder="TEST12345" {...field} />
                    </FormControl>
                    <FormDescription>
                      Codice per testare eventi in Events Manager (solo sviluppo)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="capi_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4 mt-4">
                    <div className="space-y-0.5">
                      <FormLabel>Abilita CAPI</FormLabel>
                      <FormDescription>
                        Invia automaticamente eventi Lead e Purchase
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!form.watch("pixel_id") || !form.watch("capi_token_key")}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <p className="text-xs text-muted-foreground mt-3">
                ⓘ Gli eventi vengono inviati solo per contatti con consenso marketing attivo.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={createMetaApp.isPending || updateMetaApp.isPending}>
                {editingApp ? "Salva modifiche" : "Crea Meta App"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
