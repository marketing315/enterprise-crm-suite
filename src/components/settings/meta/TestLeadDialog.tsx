import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Zap, RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MetaApp } from "@/hooks/useMetaApps";

interface Form {
  id: string;
  name: string;
  status: string;
}

interface TestLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metaApp: MetaApp | null;
}

export function TestLeadDialog({ open, onOpenChange, metaApp }: TestLeadDialogProps) {
  const [forms, setForms] = useState<Form[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [loadingForms, setLoadingForms] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  const fetchForms = async () => {
    if (!metaApp) return;
    
    setLoadingForms(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error("Sessione non trovata");
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/meta-create-test-lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ 
          meta_app_id: metaApp.id, 
          action: "list_forms" 
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        // Check for specific permission error
        if (result.fb_error?.code === 200 && result.fb_error?.message?.includes("pages_manage_ads")) {
          setPermissionError(true);
          return;
        }
        // Check for Page Access Token error
        if (result.fb_error?.code === 190 && result.fb_error?.message?.includes("Page Access Token")) {
          setPermissionError(true);
          return;
        }
        throw new Error(result.error || "Errore nel caricamento dei form");
      }

      setPermissionError(false);
      setForms(result.forms || []);
      if (result.forms?.length === 1) {
        setSelectedFormId(result.forms[0].id);
      }
    } catch (error: any) {
      console.error("Error fetching forms:", error);
      toast.error(error.message || "Errore nel caricamento dei form");
    } finally {
      setLoadingForms(false);
    }
  };

  useEffect(() => {
    if (open && metaApp) {
      fetchForms();
    }
  }, [open, metaApp?.id]);

  const handleCreateTestLead = async () => {
    if (!metaApp || !selectedFormId) return;

    setCreatingLead(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error("Sessione non trovata");
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/meta-create-test-lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ 
          meta_app_id: metaApp.id, 
          action: "create_test_lead",
          form_id: selectedFormId
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Errore nella creazione del lead test");
      }

      toast.success("Lead test creato con successo! Controlla la sezione Contatti.");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating test lead:", error);
      toast.error(error.message || "Errore nella creazione del lead test");
    } finally {
      setCreatingLead(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Crea Lead Test
          </DialogTitle>
          <DialogDescription>
            Seleziona un form e crea un lead test che verrà inviato al webhook.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Form Lead</label>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={fetchForms}
                disabled={loadingForms}
              >
                <RefreshCw className={`h-4 w-4 ${loadingForms ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            
            {loadingForms ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : permissionError ? (
              <Alert variant="destructive" className="border-destructive/50">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-3">
                  <p>
                    Il token attuale non è un <strong>Page Access Token</strong> valido o non ha 
                    i permessi necessari (<code>pages_manage_ads</code>, <code>leads_retrieval</code>).
                  </p>
                  <p className="text-sm">
                    Assicurati di usare un <strong>Long-Lived Page Access Token</strong> con i permessi corretti, 
                    oppure usa lo strumento ufficiale Meta:
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => window.open("https://developers.facebook.com/tools/lead-ads-testing", "_blank")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Apri Meta Lead Ads Testing Tool
                  </Button>
                </AlertDescription>
              </Alert>
            ) : forms.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nessun form trovato. Assicurati che la pagina abbia form lead attivi.
              </p>
            ) : (
              <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona un form..." />
                </SelectTrigger>
                <SelectContent>
                  {forms.map((form) => (
                    <SelectItem key={form.id} value={form.id}>
                      {form.name} ({form.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedFormId && !permissionError && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">
                Verrà creato un lead test con dati fittizi. Il lead arriverà al webhook 
                e creerà un nuovo contatto nel sistema.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button 
            onClick={handleCreateTestLead}
            disabled={!selectedFormId || creatingLead}
          >
            {creatingLead && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crea Lead Test
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
