# Login con Face ID / impronta — piano

## Cosa fa per l'utente

1. L'utente accede una prima volta con email + password.
2. In **Impostazioni → Sicurezza account** trova una nuova card "Accesso rapido biometrico" → tap su *Attiva*:
   - il browser chiede Face ID / impronta;
   - l'utente sceglie un **PIN a 6 cifre** come riserva;
   - la sessione viene messa in una "cassaforte" cifrata sul dispositivo.
3. Al successivo avvio dell'app, nella schermata di login compare un bottone **"Sblocca con Face ID / impronta"**.
   - Tap → prompt biometrico → entra senza digitare niente.
   - Se la biometria fallisce o non è disponibile → tastierino PIN.
   - Se sbaglia il PIN 5 volte → attesa 15 min; dopo 10 errori → cassaforte cancellata e si torna al login con password.
4. Per **admin/CEO** lo sblocco biometrico vale come secondo fattore e salta la richiesta TOTP per 30 giorni (stessa logica del "fidati di questo dispositivo" già esistente).

L'accesso classico email+password resta sempre disponibile (non lo tocchiamo).

## File toccati o creati

### Database (1 migration additiva)

- Tabella nuova `public.user_biometric_credentials`
  - `id uuid pk`, `user_id uuid not null`, `pin_hash text not null` (bcrypt via `crypt`/`gen_salt`)
  - `pin_attempts int default 0`, `locked_until timestamptz`
  - `label text`, `last_used_at`, `created_at`, `disabled_at`
  - RLS: SELECT/INSERT/UPDATE/DELETE solo dove `user_id = get_user_id(auth.uid())`. GRANT a `authenticated` + `service_role`.
- Colonna additiva `method text default 'totp'` su `mfa_trusted_devices` (additiva, default safe per record esistenti).
- RPC SECURITY DEFINER (`search_path=public`, REVOKE da PUBLIC/anon):
  - `set_biometric_pin(_pin_hash text, _label text)` → upsert credenziale.
  - `verify_biometric_pin(_pin_hash text)` → ritorna `{ok, locked_until}` e applica lockout/incremento attempts.
  - `disable_biometric()` → soft-disable.
  - `register_biometric_aal2_grant(_token_hash text, _days int default 30)` → riusa `mfa_trusted_devices` con `method='biometric'`.
  - `check_biometric_aal2(_token_hash text)` → check + estensione last_seen.
- Audit: ogni RPC scrive su `log_audit_event` (enable / disable / unlock_ok / unlock_fail / pin_change / lockout).

### Frontend — librerie nuove (`src/lib/biometric/`)

- `webauthn.ts` — wrapper su `navigator.credentials`: `isPlatformAuthenticatorAvailable()`, `createPlatformCredential()`, `assertCredential(handle)`, gestione extension `prf` (Chrome/iOS 17+) per derivare un secret stabile dalla biometria.
- `crypto.ts` — `deriveKeyFromPin()` (PBKDF2 250k), `wrap/unwrap` AES-GCM 256, IV random 12 byte.
- `session-vault.ts` — `saveSession()`, `loadSession()`, `clear()` su IndexedDB (chiave: `ralph-bio-vault/{userId}`). Strutture: `{ wrappedSession, salt, iv, credentialHandle, hasPrf }`.
- `pin-policy.ts` — validazione 6 cifre, no sequenze banali, hashing client-side prima dell'invio RPC.

### Frontend — UI

- `src/components/settings/BiometricSettingsCard.tsx` — nuova card in `/settings/security`:
  - stato (Attivo / non disponibile / disattivato), pulsanti *Attiva*, *Cambia PIN*, *Disattiva*, ultimo uso, dispositivo.
  - rilevamento supporto WebAuthn platform → mostra alert non bloccante se assente.
- `src/components/auth/BiometricUnlockPanel.tsx` — pannello in cima a `LoginForm` quando il device ha un vault valido: bottone "Sblocca con Face ID/impronta" + link "Usa PIN" + link "Accedi con password".
- `src/components/auth/BiometricPinPad.tsx` — tastierino 6 cifre, gestisce lockout, conta tentativi.
- `src/pages/SettingsSecurity.tsx` — monta `BiometricSettingsCard` sotto `MfaSettingsCard`.
- `src/components/auth/LoginForm.tsx` — se rileva vault biometrico per un utente (chiave `ralph.bio.lastUser`), mostra `BiometricUnlockPanel` sopra al form.

### Frontend — context e guard

- `src/contexts/AuthContext.tsx`
  - nuovi metodi `signInWithBiometric()`, `enableBiometric(pin)`, `disableBiometric()`, `changeBiometricPin(oldPin, newPin)`;
  - dopo signin password riuscito, se vault abilitato → rinfresca la cassaforte con i token nuovi;
  - al logout: NON cancella il vault per default (preferenza opt-in in Settings).
- `src/components/auth/MfaGuard.tsx` — accetta come "secondo fattore" anche un grant `biometric` valido (riuso `check_biometric_aal2`); l'IdleTimeoutWatcher tratta il dispositivo come trusted con lo stesso criterio.

### Test

- `src/test/biometric/crypto.unit.test.ts` — wrap/unwrap roundtrip, PIN sbagliato fallisce.
- `src/test/biometric/pin-policy.unit.test.ts` — regole PIN.
- `e2e/biometric-unlock.spec.ts` — happy path con WebAuthn virtual authenticator (Playwright `--enable-features=AutomationControlled` + `Browser.addVirtualAuthenticator`).

## Dettagli tecnici

### Modello cassaforte locale (per device, per utente)

```text
                    ┌────────────────────────────────────────┐
                    │ IndexedDB ralph-bio-vault/{userId}     │
                    ├────────────────────────────────────────┤
        Face ID/    │ credentialHandle  (rawId WebAuthn)     │
        impronta ─▶ │ hasPrf            (bool)               │
                    │ wrappedSession    (AES-GCM ciphertext) │
                    │ salt, iv          (random 12/16 B)     │
        PIN ──────▶ │ wrappedKey        (AES-GCM ciphertext) │
                    └────────────────────────────────────────┘
```

- **Setup**: random `wrappingKey` 256-bit → cifra la `Session` Supabase (`access_token`+`refresh_token`+`expires_at`). La `wrappingKey` viene cifrata **due volte**:
  1. con il secret PRF di WebAuthn (se disponibile);
  2. con la chiave PBKDF2 derivata dal PIN.
- **Unlock biometrico**: `assertCredential` → secret PRF → unwrap `wrappingKey` → unwrap session → `supabase.auth.setSession`.
- **Fallback PIN**: PIN → PBKDF2 → unwrap `wrappingKey` → idem. Server-side `verify_biometric_pin` controlla l'hash e applica lockout (l'unwrap locale e la verifica server avvengono in parallelo: lo sblocco riesce solo se entrambi OK).
- Su browser senza PRF (Safari < 17, vecchi Chrome) lo sblocco biometrico richiede sempre il PIN dopo Face ID: la biometria conferma l'intento, il PIN sblocca la chiave. Lo dichiariamo nella UI.

### MFA per admin/CEO

Lo sblocco biometrico riuscito chiama `register_biometric_aal2_grant`: viene salvato un token (hash) in `mfa_trusted_devices` con `method='biometric'`, durata 30g. `MfaGuard` e `IdleTimeoutWatcher` già usano `isDeviceTrusted` → estendiamo la query lato server per accettare anche i grant biometrici. Niente cambia per chi non ha biometria attiva.

### Sicurezza

- Niente token in chiaro in `localStorage` o `IndexedDB`.
- PIN mai trasmesso in chiaro: hash SHA-256 client + bcrypt server (`crypt`+`gen_salt('bf',12)`).
- Lockout server-side oltre a quello client (anti-bypass via devtools).
- Wipe automatico del vault dopo 10 PIN errati o se `refresh_token` non più valido lato Supabase.
- Audit completo via `log_audit_event` (tenant + brand).
- Niente impatto su PWA / service worker / cache (operazioni puramente RPC).

### Cosa NON facciamo (out of scope di questo task)

- Passkey "vero" passwordless (richiederebbe `@simplewebauthn` + 2 edge function + tabella credenziali pubbliche).
- Capacitor / app nativa.
- Sincronizzazione biometrica tra dispositivi (è per-device by design).
- Cambio del flusso email+password e di Google sign-in esistenti.
