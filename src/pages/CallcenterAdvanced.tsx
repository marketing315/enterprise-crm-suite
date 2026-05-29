/**
 * F6 Step #6 — "Centralino avanzato" full-screen wallboard.
 *
 * Pagina dedicata fuori da Settings, accessibile a admin/CEO/responsabili call-center.
 * Aggrega in un'unica vista:
 *  - Agenti live + KPI code (LiveAgentsPanel)
 *  - Matrice instradamento code ↔ IVR (VoispeedQueueRouting)
 *  - Albero IVR sincronizzato (VoispeedIvrTree)
 *
 * Tutti i dati sono read-only e realtime via `voispeed-status-poll` + `voispeed-ivr-sync`.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, Bell } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VoispeedQueueRouting } from "@/components/settings/VoispeedQueueRouting";
import { VoispeedIvrTree } from "@/components/settings/VoispeedIvrTree";

export default function CallcenterAdvanced() {
  const { currentBrand } = useBrand();
  const navigate = useNavigate();

  useEffect(() => {
    const prev = document.title;
    document.title = "Centralino avanzato · VoiSpeed";
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="container mx-auto py-6 space-y-6">


      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Radio className="h-7 w-7 text-primary" />
            Centralino avanzato
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vista live agenti, code e instradamento IVR del brand{" "}
            {currentBrand ? <strong>{currentBrand.name}</strong> : "selezionato"}.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/voispeed-queue-alerts')}>
          <Bell className="h-4 w-4 mr-1" />
          Regole alert code
        </Button>
      </header>

      {!currentBrand ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground text-center">
            Seleziona un brand per visualizzare il centralino avanzato.
          </CardContent>
        </Card>
      ) : (
        <>
          <VoispeedQueueRouting />
          <VoispeedIvrTree />
        </>
      )}
    </div>
  );
}
