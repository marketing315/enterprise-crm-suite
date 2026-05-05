import { MfaSettingsCard } from "@/components/settings/MfaSettingsCard";

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
    </div>
  );
}
