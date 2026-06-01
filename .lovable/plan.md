## Obiettivo

Quando clicchi "Accedi con passkey" il browser deve mostrare il selettore di passkey (Face ID/Touch ID/Windows Hello/iCloud Keychain/Google Password Manager). Tu confermi con la biometria, e il server identifica automaticamente l'account associato a quella passkey e ti logga, senza chiedere email o PIN.

Oggi non funziona così: oggi memorizziamo solo l'ID credenziale lato browser e sblocchiamo una sessione cifrata in IndexedDB. Senza vault locale (es. nuovo browser, anche con passkey sincronizzata via iCloud) non possiamo identificare l'utente.

Per il vero login passkey serve **WebAuthn discoverable** + verifica firma lato server.

## Cosa cambia in concreto

### 1. Database — arricchire `user_biometric_credentials`

Migration additiva (NULL-safe per le credenziali esistenti):
- `public_key BYTEA` — chiave pubblica COSE estratta dall'attestazione
- `public_key_alg INT` — algoritmo (es. -7 ES256, -257 RS256)
- `sign_count BIGINT NOT NULL DEFAULT 0` — contatore anti-clone
- `aaguid UUID` — opzionale, per riconoscere l'authenticator
- `transports TEXT[]` — hint trasporti (internal/hybrid/usb)

Le credenziali create prima di questa migration non avranno `public_key`: continueranno a funzionare per lo **sblocco locale**, ma per il **login server** l'utente dovrà ri-registrare la passkey una volta (lo gestiamo con un avviso nel profilo).

Indice nuovo: `UNIQUE (credential_id)` per lookup O(1) sul rawId ricevuto dal browser.

### 2. Edge functions

Due nuove function pubbliche (`verify_jwt = false`, rate-limit IP via `consume_ip_rate_limit`):

**`passkey-auth-begin`**
- Genera challenge random (32 byte), TTL 5 min
- La salva su nuova tabella `passkey_auth_challenges (challenge_b64, created_at, consumed_at)`
- Risponde `{ challenge, rpId, timeout: 60000 }`

**`passkey-auth-verify`**
- Riceve `{ challenge, credentialId, clientDataJSON, authenticatorData, signature, userHandle }`
- Consuma la challenge (single-use, fail se già usata o scaduta)
- Lookup `user_biometric_credentials` per `credential_id`
- Verifica firma WebAuthn con la `public_key` salvata (libreria `@simplewebauthn/server` via `npm:` specifier)
- Aggiorna `sign_count` (rifiuta se non aumenta → clone detection)
- Genera un **magiclink Supabase** con `admin.generateLink({ type: 'magiclink', email })` per l'utente associato
- Risponde `{ action_link }` → il client fa `supabase.auth.verifyOtp` dal token nel link

### 3. Client — `PasskeyLoginButton`

Nuovo flusso, sostituisce quello attuale:
1. `fetch passkey-auth-begin` → ottiene challenge
2. `navigator.credentials.get({ publicKey: { challenge, rpId, userVerification: "required" /* niente allowCredentials → discoverable */ }})` → il browser mostra il selettore con tutte le passkey sincronizzate per questo dominio
3. Manda la risposta a `passkey-auth-verify`
4. Riceve `action_link` → estrae il token → `supabase.auth.verifyOtp({ type: 'magiclink', token, email })`
5. Naviga a `/select-brand`

Se l'utente annulla o non ha passkey valide → resta sulla schermata di login (come ora, niente PIN).

### 4. MFA per admin/CEO

Una passkey con `userVerification: "required"` è già un secondo fattore biometrico. Per gli admin/CEO la consideriamo equivalente al "trusted device 30g" (stesso pattern già usato per la biometria), così non chiediamo anche il TOTP.

## Sicurezza

- Challenge single-use con TTL → no replay
- Verifica firma con chiave pubblica reale (no shortcut)
- Sign counter monotonico → clone detection
- Rate-limit IP sulla `verify` (5 req/min) per evitare enumerazione credenziali
- RP ID hard-coded sul dominio reale (no wildcard)
- `assertSafeUrl` non si applica (no outbound user URL)
- Audit `log_audit_event` su ogni `passkey_login_success` e `passkey_login_failed`

## Note sui limiti attuali

- Le passkey **già registrate prima** di questa migration potranno solo fare lo sblocco locale finché l'utente non le rigenera (mostriamo un banner nel profilo: "Aggiorna la tua passkey per accedere da nuovi dispositivi")
- L'utente deve esistere già nel sistema: il login passkey non crea nuovi account
- Su browser senza WebAuthn discoverable (vecchi Safari/Firefox) il pulsante non funzionerà → fallback resta email+password o "Accedi con PIN"

## Test E2E

- Registra passkey su iPhone Safari (Face ID sincronizzato iCloud)
- Apri il CRM su Mac Chrome → click "Accedi con passkey" → deve apparire il selettore con la passkey iCloud → conferma → login
- Verifica sign_count aumentato, audit log scritto, sessione Supabase attiva
- Rigioca la stessa challenge → deve fallire (single-use)
