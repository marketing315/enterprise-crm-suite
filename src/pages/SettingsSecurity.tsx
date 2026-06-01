import { Bug } from "lucide-react";
import { MfaSettingsCard } from "@/components/settings/MfaSettingsCard";
import { BiometricSettingsCard } from "@/components/settings/BiometricSettingsCard";
import { PasskeyDevicesCard } from "@/components/settings/PasskeyDevicesCard";
import { IdentityLinkingCard } from "@/components/settings/IdentityLinkingCard";
import { IdleTimeoutSettingsCard } from "@/components/settings/IdleTimeoutSettingsCard";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { openErrorConsole } from "@/components/admin/ErrorConsolePanel";

/**
 * A5 — dedicated security settings page (auth-related only).
 * Linked from /settings and from the user dropdown menu.
 */
export default function SettingsSecurity() {
  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Sicurezza account</h1>
        <p className="text-sm text-muted-foreground">
          Gestisci l'autenticazione a due fattori (MFA) e la sicurezza della tua sessione.
        </p>
      </div>
      <MfaSettingsCard />
      <PasskeyDevicesCard />
      <IdentityLinkingCard />
      <BiometricSettingsCard />
      <IdleTimeoutSettingsCard />


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bug className="h-4 w-4 text-destructive" />
            Diagnostica e console errori
          </CardTitle>
          <CardDescription>
            Apri la console degli errori del browser per ispezionare warning e
            eccezioni della sessione corrente. Utile quando segnali un bug al
            supporto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => openErrorConsole()}>
            <Bug className="mr-2 h-4 w-4" />
            Apri console errori
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

