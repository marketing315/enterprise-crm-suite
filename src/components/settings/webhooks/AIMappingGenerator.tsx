import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Sparkles, AlertCircle, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

interface Props {
  onMappingGenerated: (mapping: Record<string, string>) => void;
}

export function AIMappingGenerator({ onMappingGenerated }: Props) {
  const { currentBrand } = useBrand();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    fieldCount?: number;
    error?: string;
  } | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim() || !currentBrand?.id) {
      toast.error("Inserisci una descrizione del mapping");
      return;
    }

    setIsLoading(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-webhook-mapping", {
        body: {
          prompt: prompt.trim(),
          brandId: currentBrand.id,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.mapping) {
        onMappingGenerated(data.mapping);
        setLastResult({ success: true, fieldCount: data.field_count });
        toast.success(`Mapping generato con ${data.field_count} campi`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore durante la generazione";
      setLastResult({ success: false, error: message });
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Sparkles className="h-4 w-4" />
        Genera Mapping con AI
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-prompt" className="text-xs text-muted-foreground">
          Descrivi quali campi vuoi mappare in linguaggio naturale
        </Label>
        <Textarea
          id="ai-prompt"
          placeholder={`Es: "Mappa nome e cognome del contatto, email, telefono principale, indirizzo completo con città e CAP, partita IVA e codice fiscale. Includi anche la sorgente del lead e il messaggio."`}
          className="min-h-[80px] text-sm"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={handleGenerate}
          disabled={isLoading || !prompt.trim()}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generazione...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Genera Mapping
            </>
          )}
        </Button>

        {lastResult && (
          <div className="flex items-center gap-1.5 text-xs">
            {lastResult.success ? (
              <>
                <CheckCircle className="h-3.5 w-3.5 text-primary" />
                <span className="text-primary">{lastResult.fieldCount} campi generati</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-destructive">{lastResult.error}</span>
              </>
            )}
          </div>
        )}
      </div>

      <Alert className="bg-muted/50">
        <AlertDescription className="text-xs">
          L'AI interpreterà la tua descrizione e genererà automaticamente il JSON di mapping.
          Puoi poi modificare manualmente il risultato nel campo sottostante.
        </AlertDescription>
      </Alert>
    </div>
  );
}
