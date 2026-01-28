import { useEffect } from "react";
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

const formSchema = z.object({
  brand_slug: z.string().min(1, "Brand slug richiesto").regex(/^[a-z0-9-]+$/, "Solo lettere minuscole, numeri e trattini"),
  verify_token: z.string().min(8, "Minimo 8 caratteri"),
  app_secret: z.string().min(1, "App Secret richiesto"),
  page_id: z.string().optional(),
  access_token: z.string().min(1, "Access Token richiesto"),
  is_active: z.boolean(),
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

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      brand_slug: "",
      verify_token: generateVerifyToken(),
      app_secret: "",
      page_id: "",
      access_token: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (editingApp) {
      form.reset({
        brand_slug: editingApp.brand_slug,
        verify_token: editingApp.verify_token,
        app_secret: editingApp.app_secret,
        page_id: editingApp.page_id || "",
        access_token: editingApp.access_token,
        is_active: editingApp.is_active,
      });
    } else {
      form.reset({
        brand_slug: currentBrand?.slug || "",
        verify_token: generateVerifyToken(),
        app_secret: "",
        page_id: "",
        access_token: "",
        is_active: true,
      });
    }
  }, [editingApp, open, currentBrand]);

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
        });
      } else {
        await createMetaApp.mutateAsync({
          brand_id: currentBrand.id,
          brand_slug: data.brand_slug,
          verify_token: data.verify_token,
          app_secret: data.app_secret,
          access_token: data.access_token,
          is_active: data.is_active,
          page_id: data.page_id || undefined,
        });
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
    navigator.clipboard.writeText(value);
    toast.success(`${label} copiato`);
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
