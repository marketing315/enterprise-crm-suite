import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Check, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  generateWebhookSecret,
  WEBHOOK_EVENT_TYPES,
} from "@/hooks/useWebhooks";

// Allow http://127.0.0.1 for local testing, otherwise require HTTPS
const isValidWebhookUrl = (url: string): boolean => {
  if (url.startsWith("https://")) return true;
  // Allow localhost/loopback for E2E testing only
  if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
    return true;
  }
  return false;
};

const formSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(100),
  url: z.string().url("URL non valido").refine(isValidWebhookUrl, {
    message: "L'URL deve usare HTTPS (http://127.0.0.1 consentito per test)",
  }),
  event_types: z.array(z.string()).min(1, "Seleziona almeno un evento"),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhookId: string | null;
}

export function WebhookFormDrawer({ open, onOpenChange, webhookId }: Props) {
  const { data: webhooks } = useWebhooks();
  const createWebhook = useCreateWebhook();
  const updateWebhook = useUpdateWebhook();

  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  const isEdit = !!webhookId;
  const existingWebhook = webhooks?.find((w) => w.id === webhookId);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      url: "",
      event_types: [],
      is_active: true,
    },
  });

  const eventTypes = watch("event_types");
  const isActive = watch("is_active");

  useEffect(() => {
    if (existingWebhook) {
      reset({
        name: existingWebhook.name,
        url: existingWebhook.url,
        event_types: existingWebhook.event_types,
        is_active: existingWebhook.is_active,
      });
    } else {
      reset({
        name: "",
        url: "",
        event_types: [],
        is_active: true,
      });
    }
    setGeneratedSecret(null);
    setSecretCopied(false);
  }, [existingWebhook, reset, open]);

  const handleEventToggle = (eventValue: string, checked: boolean) => {
    const current = eventTypes || [];
    if (checked) {
      setValue("event_types", [...current, eventValue]);
    } else {
      setValue(
        "event_types",
        current.filter((e) => e !== eventValue)
      );
    }
  };

  const handleGenerateSecret = () => {
    const newSecret = generateWebhookSecret();
    setGeneratedSecret(newSecret);
    setSecretCopied(false);
  };

  const handleCopySecret = async () => {
    if (generatedSecret) {
      await navigator.clipboard.writeText(generatedSecret);
      setSecretCopied(true);
      toast.success("Secret copiato negli appunti");
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      if (isEdit) {
        await updateWebhook.mutateAsync({
          id: webhookId,
          name: data.name,
          url: data.url,
          event_types: data.event_types,
          is_active: data.is_active,
        });
        toast.success("Webhook aggiornato");
        onOpenChange(false);
      } else {
        if (!generatedSecret) {
          toast.error("Genera prima un secret");
          return;
        }
        const result = await createWebhook.mutateAsync({
          name: data.name,
          url: data.url,
          secret: generatedSecret,
          event_types: data.event_types,
          is_active: data.is_active,
        });
        toast.success("Webhook creato");
        // Keep drawer open to show secret one more time
        setGeneratedSecret(result.secret);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore durante il salvataggio");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Modifica Webhook" : "Nuovo Webhook"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Modifica le impostazioni del webhook"
              : "Configura un nuovo endpoint per ricevere eventi"}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              placeholder="Es. CRM Webhook"
              {...register("name")}
              data-testid="webhook-name-input"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="url">URL Endpoint</Label>
            <Input
              id="url"
              placeholder="https://example.com/webhook"
              {...register("url")}
              data-testid="webhook-url-input"
            />
            {errors.url && (
              <p className="text-sm text-destructive">{errors.url.message}</p>
            )}
          </div>

          {/* Secret (only for create) */}
          {!isEdit && (
            <div className="space-y-2">
              <Label>Signing Secret</Label>
              {!generatedSecret ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateSecret}
                  className="w-full"
                  data-testid="generate-secret-btn"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Genera Secret
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={generatedSecret}
                      readOnly
                      className="font-mono text-xs"
                      data-testid="generated-secret-input"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleCopySecret}
                      data-testid="copy-secret-btn"
                    >
                      {secretCopied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Copia questo secret ora. Non sarà più visibile dopo la creazione.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>
          )}

          {/* Event Types */}
          <div className="space-y-2">
            <Label>Eventi da ricevere</Label>
            <div className="grid grid-cols-2 gap-2 rounded-md border p-4">
              {WEBHOOK_EVENT_TYPES.map((event) => (
                <div key={event.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={event.value}
                    checked={eventTypes?.includes(event.value)}
                    onCheckedChange={(checked) =>
                      handleEventToggle(event.value, !!checked)
                    }
                    data-testid={`event-type-${event.value}`}
                  />
                  <label
                    htmlFor={event.value}
                    className="text-sm cursor-pointer"
                  >
                    {event.label}
                  </label>
                </div>
              ))}
            </div>
            {errors.event_types && (
              <p className="text-sm text-destructive">{errors.event_types.message}</p>
            )}
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Attivo</Label>
              <p className="text-sm text-muted-foreground">
                {isActive ? "Il webhook riceverà eventi" : "Il webhook è disabilitato"}
              </p>
            </div>
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={(checked) => setValue("is_active", checked)}
            />
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || (!isEdit && !generatedSecret)}
              data-testid="save-webhook-btn"
            >
              {isEdit ? "Salva modifiche" : "Crea Webhook"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
