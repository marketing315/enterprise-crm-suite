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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Check, AlertCircle, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  generateWebhookSecret,
  WEBHOOK_EVENT_TYPE_CATEGORIES,
  type PayloadFormat,
  type PayloadMapping,
  type CustomUrlParams,
} from "@/hooks/useWebhooks";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AIMappingGenerator } from "./AIMappingGenerator";
import { FieldMappingEditor } from "./FieldMappingEditor";
 import { LinkedAutomationsSection } from "./LinkedAutomationsSection";

const formSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(100),
  url: z.string().url("URL non valido"),
  event_types: z.array(z.string()).min(1, "Seleziona almeno un evento"),
  is_active: z.boolean(),
  payload_format: z.enum(["json", "form_urlencoded"]),
  payload_mapping_json: z.string().optional(),
  custom_url_params_json: z.string().optional(),
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
  const [showAdvanced, setShowAdvanced] = useState(false);

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
      payload_format: "json",
      payload_mapping_json: "",
      custom_url_params_json: "",
    },
  });

  const eventTypes = watch("event_types");
  const isActive = watch("is_active");
  const payloadFormat = watch("payload_format");

  useEffect(() => {
    if (existingWebhook) {
      reset({
        name: existingWebhook.name,
        url: existingWebhook.url,
        event_types: existingWebhook.event_types,
        is_active: existingWebhook.is_active,
        payload_format: existingWebhook.payload_format || "json",
        payload_mapping_json: existingWebhook.payload_mapping
          ? JSON.stringify(existingWebhook.payload_mapping, null, 2)
          : "",
        custom_url_params_json: existingWebhook.custom_url_params
          ? JSON.stringify(existingWebhook.custom_url_params, null, 2)
          : "",
      });
      // Show advanced if there are custom settings
      setShowAdvanced(
        existingWebhook.payload_format === "form_urlencoded" ||
        !!existingWebhook.payload_mapping ||
        !!existingWebhook.custom_url_params
      );
    } else {
      reset({
        name: "",
        url: "",
        event_types: [],
        is_active: true,
        payload_format: "json",
        payload_mapping_json: "",
        custom_url_params_json: "",
      });
      setShowAdvanced(false);
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

  const parseJsonSafe = (str: string | undefined): Record<string, string> | null => {
    if (!str || str.trim() === "") return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      const payloadMapping = parseJsonSafe(data.payload_mapping_json) as PayloadMapping | null;
      const customUrlParams = parseJsonSafe(data.custom_url_params_json) as CustomUrlParams | null;

      if (isEdit) {
        await updateWebhook.mutateAsync({
          id: webhookId,
          name: data.name,
          url: data.url,
          event_types: data.event_types,
          is_active: data.is_active,
          payload_format: data.payload_format as PayloadFormat,
          payload_mapping: payloadMapping,
          custom_url_params: customUrlParams,
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
          payload_format: data.payload_format as PayloadFormat,
          payload_mapping: payloadMapping,
          custom_url_params: customUrlParams,
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
            <div className="space-y-4 rounded-md border p-4 max-h-[300px] overflow-y-auto">
              {WEBHOOK_EVENT_TYPE_CATEGORIES.map((category) => (
                <div key={category.category}>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {category.category}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {category.events.map((event) => (
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
                </div>
              ))}
            </div>
            {errors.event_types && (
              <p className="text-sm text-destructive">{errors.event_types.message}</p>
            )}
          </div>

          {/* Advanced Settings */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" type="button" className="w-full justify-start gap-2 text-muted-foreground">
                <Settings2 className="h-4 w-4" />
                Impostazioni avanzate
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              {/* Payload Format */}
              <div className="space-y-2">
                <Label>Formato Payload</Label>
                <Select
                  value={payloadFormat}
                  onValueChange={(v) => setValue("payload_format", v as PayloadFormat)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON (standard)</SelectItem>
                    <SelectItem value="form_urlencoded">Form URL-Encoded (Siseco, legacy)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Usa Form URL-Encoded per integrazioni legacy come Siseco/SiLeads
                </p>
              </div>

              {/* Custom URL Params */}
              <div className="space-y-2">
                <Label>Parametri URL aggiuntivi (JSON)</Label>
                <Textarea
                  placeholder='{"idprogetto": "487"}'
                  className="font-mono text-xs min-h-[60px]"
                  {...register("custom_url_params_json")}
                />
                <p className="text-xs text-muted-foreground">
                  Parametri query string aggiunti all'URL, es. ?idprogetto=487
                </p>
              </div>

              {/* Payload Mapping (only for form_urlencoded) */}
              {payloadFormat === "form_urlencoded" && (
                <div className="space-y-4">
                  {/* Structured Field Mapping Editor */}
                  <FieldMappingEditor
                    value={parseJsonSafe(watch("payload_mapping_json")) || {}}
                    onChange={(mapping) => {
                      setValue("payload_mapping_json", JSON.stringify(mapping, null, 2));
                    }}
                  />

                  {/* AI Mapping Generator (optional) */}
                  <AIMappingGenerator
                    onMappingGenerated={(mapping) => {
                      setValue("payload_mapping_json", JSON.stringify(mapping, null, 2));
                    }}
                  />

                  {/* Collapsible JSON editor for advanced users */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" type="button" size="sm" className="text-xs text-muted-foreground">
                        Mostra JSON grezzo
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <Textarea
                        placeholder='{"nome": "contact_snapshot.first_name"}'
                        className="font-mono text-xs min-h-[100px]"
                        {...register("payload_mapping_json")}
                      />
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

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

           {/* Linked Automations - show for outbound webhooks */}
           {isEdit && (
             <LinkedAutomationsSection
               eventTypeFilter="inbound.*"
               defaultEventType="inbound.*"
               title="Automazioni collegate"
             />
           )}
 
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
