import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Download, CheckCircle2, Smartphone, Share, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Install() {
  const { isInstallable, isInstalled, isIOS, installApp } = usePWAInstall();
  const navigate = useNavigate();

  const handleInstall = async () => {
    const success = await installApp();
    if (success) {
      navigate("/dashboard");
    }
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader className="pb-4">
            <div className="mx-auto w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <CardTitle className="text-2xl">App Installata!</CardTitle>
            <CardDescription>
              CRM Gruppo Benessere è già installata sul tuo dispositivo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/dashboard")} className="w-full">
              Vai alla Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Smartphone className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Installa l'App</CardTitle>
            <CardDescription>
              Aggiungi CRM Gruppo Benessere alla schermata Home per un accesso rapido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-medium">Tocca il pulsante Condividi</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Share className="h-4 w-4" /> in Safari
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-medium">Seleziona "Aggiungi a Home"</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Plus className="h-4 w-4" /> dal menu
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-medium">Conferma l'installazione</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tocca "Aggiungi" in alto a destra
                  </p>
                </div>
              </div>
            </div>

            <Button variant="outline" onClick={() => navigate("/dashboard")} className="w-full">
              Continua nel Browser
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Download className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Installa l'App</CardTitle>
          <CardDescription>
            Installa CRM Gruppo Benessere per un'esperienza ottimale con accesso offline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isInstallable ? (
            <>
              <ul className="text-left space-y-2 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Accesso rapido dalla schermata Home
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Funziona anche offline
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Caricamento più veloce
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Esperienza a schermo intero
                </li>
              </ul>
              <Button onClick={handleInstall} className="w-full" size="lg">
                <Download className="h-4 w-4 mr-2" />
                Installa Ora
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Per installare l'app, utilizza il menu del browser e seleziona "Installa" o "Aggiungi a schermata Home".
              </p>
              <Button variant="outline" onClick={() => navigate("/dashboard")} className="w-full">
                Continua nel Browser
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
