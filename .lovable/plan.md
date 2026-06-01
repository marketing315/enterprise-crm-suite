## Obiettivo

Permettere al CEO/admin di accedere via Face ID / Touch ID / impronta da **qualunque dispositivo personale** (sincronizzato via iCloud Keychain o Google Password Manager) **e** di avere un fallback "Email + PIN" che funziona su **qualunque browser nuovo**, senza dover ri-fare l'enrollment ogni volta.

---

## Cosa cambia rispetto all'attuale

Oggi il flusso biometrico ralph:
- Crea una credenziale WebAuthn legata al **device** (non sincronizzata).
- Crea un **vault locale** in IndexedDB con la sessione cifrata.
- Sul login mostra il pannello biometrico **solo** se quel browser ha già `lastBiometricUser` + vault.

Risultato: se cambi browser/PC/telefono, niente biometria.

Opzione C porta due cambi:

### 1. Passkey sincronizzate (iCloud Keychain / Google Password Manager)
- In `enableBiometric` chiediamo a WebAuthn una credenziale **discoverable + multi-device** (`residentKey: 'required'`, `authenticatorAttachment` non vincolato, `userVerification: 'required'`). Su iOS/macOS recenti e Android/Chrome viene salvata come passkey sincronizzata.
- In `unlockBiometric` usiamo **conditional UI** (`navigator.credentials.get({ mediation: 'conditional' })`) sul campo email del login: il browser propone automaticamente la passkey disponibile (anche se sincronizzata da un altro device Apple/Google dello stesso utente).
- Lato server salviamo `credential_id` + `public_key` + `aaguid` in `user_biometric_credentials` come oggi, ma marcandola `is_synced = true` quando l'authenticator lo dichiara (`backupEligible` / `backupState` dal CBOR).

### 2. Fallback "Email + PIN" universale
- Sul `/login` mostriamo sempre un link "Accedi con PIN" sotto al form password.
- Apre un dialog: **Email → invio "challenge PIN" → PIN 6 cifre**.
- Server verifica con `verify_biometric_pin` (già esistente, già con lockout 5/15min e wipe a 10 tentativi).
- Su successo, l'edge function `biometric-pin-login` (nuova) emette una sessione Supabase via `admin.generateLink` o `signInWithIdToken` custom e la restituisce al client.
- Funziona su **qualunque dispositivo nuovo**, senza vault locale.

---

## Dettagli tecnici

### DB (migrazione additiva)
- `user_biometric_credentials`: aggiungere `is_synced boolean default false`, `backup_eligible boolean`, `backup_state boolean`, `last_used_at timestamptz`. Nessun drop, nessuna modifica destructive.
- Nuova RPC `start_pin_login(email)` → restituisce `{ user_id, challenge_id }` senza rivelare se l'email esiste (rate-limit IP).
- Nuova RPC `verify_pin_login(challenge_id, pin)` → wrappa `verify_biometric_pin` + emette token one-shot consumabile dall'edge function.

### Edge functions
- `biometric-passkey-register` (server-side challenge + verify attestation, opzionale: oggi ralph fa attestation client-side, lo manteniamo se preferisci).
- `biometric-pin-login` nuova: verifica il token one-shot e crea una sessione Supabase (`admin.createSession` via service_role) per l'utente. **Rate-limit IP** via `consume_ip_rate_limit` (H1) e **circuit breaker** (H7). Audit `auth_event` su ogni tentativo.

### Client
- `src/lib/biometric/passkey.ts`: refactor `enableBiometric` per richiedere passkey sincronizzata + conditional UI in `unlockBiometric`.
- `src/components/auth/BiometricUnlockPanel.tsx`: rimuovere il guard "mostra solo se hasVault" → usare **conditional UI** che si attiva automaticamente quando il browser ha una passkey valida (anche da iCloud Keychain).
- Nuovo `src/components/auth/PinLoginDialog.tsx` montato sotto al form di `/login` con link "Hai dimenticato la password? Accedi con PIN".
- `src/pages/Login.tsx`: aggiungere `autocomplete="username webauthn"` sul campo email per attivare la conditional UI.

### Sicurezza
- PIN login rate-limited per IP (10/15min) **e** per utente (già 5/15min + wipe a 10).
- Edge function `biometric-pin-login` con `verify_jwt = false`, CORS restricted, audit completo (`auth_event` + `idempotency_keys` per evitare replay del token one-shot).
- Passkey sincronizzate: nessun rischio aggiuntivo (il keychain Apple/Google è già protetto da Face ID/Touch ID del device).

---

## Domande aperte (rispondi prima che proceda)

1. **Sessione PIN login**: vuoi che dopo l'accesso col PIN il CEO sia considerato **AAL2** (come oggi avviene per la biometria → trusted-device 30g, bypass TOTP), oppure il PIN deve sempre richiedere **anche TOTP** dopo l'accesso?
2. **Conditional UI**: ok se sui browser che non la supportano (Firefox desktop) appare comunque un pulsante "Accedi con Face ID / impronta" come fallback?

Rispondi e procedo con migrazione DB + edge function + UI in un singolo passaggio.
