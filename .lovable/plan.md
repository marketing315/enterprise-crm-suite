# Login multi-metodo

Riorganizzo la pagina `/login` per offrire quattro modalità di accesso chiare e separate, mantenendo intatta tutta la logica MFA e biometrica già esistente.

## Nuovo layout di `/login`

```text
┌──────────────────────────────────────┐
│   Logo + "CRM Gruppo Benessere"     │
├──────────────────────────────────────┤
│   [ Accedi con Google ]             │
│   [ Accedi con Apple  ]             │
│   ──────── oppure ────────          │
│   [ Accedi con passkey (Face ID) ]  │
│   ──────── oppure ────────          │
│   Email      [________________]      │
│   Password   [________________] 👁   │
│   [ Accedi ]                         │
│   Password dimenticata?              │
└──────────────────────────────────────┘
```

I 4 metodi:

1. **Email + password** — invariato, con 2FA TOTP per admin/CEO già gestita da `MfaGuard`.
2. **Passkey** — pulsante esplicito sempre visibile che lancia WebAuthn discoverable (Face ID / Touch ID / Windows Hello / passkey sincronizzata iCloud-Google). Riusa `BiometricUnlockPanel` semplificandolo a un solo bottone.
3. **Google** — OAuth via `lovable.auth.signInWithOAuth("google", ...)` (managed).
4. **Apple** — OAuth via `lovable.auth.signInWithOAuth("apple", ...)` (managed).

Il flusso esistente "Accedi con PIN biometrico" (Email + PIN cross-device) viene **spostato in un link secondario** sotto password ("Non hai la passkey su questo dispositivo? Accedi con PIN") per non affollare la schermata principale ma restare disponibile come fallback universale.

## Modifiche tecniche

### Frontend
- `src/pages/Login.tsx` — nuovo layout: blocco OAuth in alto, separatore, blocco passkey, separatore, form email/password.
- `src/components/auth/SocialLoginButtons.tsx` *(nuovo)* — due pulsanti Google/Apple con icone brand, chiamano `lovable.auth.signInWithOAuth`. Loading state + toast errore.
- `src/components/auth/PasskeyLoginButton.tsx` *(nuovo)* — bottone "Accedi con passkey" che chiama `navigator.credentials.get({ publicKey: { ..., userVerification: "required" }, mediaton: "optional" })` discoverable, riusando le funzioni in `src/lib/biometric/webauthn.ts`. In caso di passkey assente o cancel, mostra toast e resta sulla pagina.
- `src/components/auth/LoginForm.tsx` — rimuovo il link "Accedi con PIN biometrico" dal footer e lo riposiziono come link discreto sotto "Password dimenticata?".
- `src/components/auth/BiometricUnlockPanel.tsx` — non più mostrato in cima alla pagina (la passkey è ora un pulsante dedicato); il pannello resta usato altrove se serve, altrimenti rimosso dall'import in `Login.tsx`.

### Backend / Auth
- Abilito Google + Apple via `configure_social_auth(providers: ["google", "apple"])` mantenendo email attiva (NON disabilito email).
- Nessuna modifica DB: la tabella `user_biometric_credentials` e tutto il flusso PIN restano invariati.
- Nessuna modifica a `MfaGuard`: admin/CEO loggati con qualunque metodo (password/passkey/Google/Apple) continueranno a passare per la challenge TOTP la prima volta su un device non trusted.

### Apple — nota importante
Apple Sign In con credenziali managed di Lovable Cloud funziona out-of-the-box. Se in futuro vuoi branding custom (il tuo nome app nella sheet Apple), serviranno Services ID + Team ID + Key ID + chiave .p8 da Apple Developer (richiede account a pagamento Apple Developer Program, $99/anno). Per ora useremo il managed.

## Cosa NON cambia
- 2FA TOTP, trusted device 30g, lockout, PIN, biometria su dispositivo, edge functions `biometric-pin-login`, RPC `start_pin_login`/`verify_pin_login`.
- Nessuna migrazione DB.
- Logica `AuthContext`, sessioni, idle timeout.

## QA
- Login email+password → admin: richiede TOTP la prima volta, poi trusted.
- Login passkey discoverable da iPhone Safari (Face ID), Mac Chrome, Android.
- Login Google → redirect OAuth → torna su `/select-brand`.
- Login Apple → redirect OAuth → torna su `/select-brand`.
- Link "Accedi con PIN" ancora funzionante come fallback.
