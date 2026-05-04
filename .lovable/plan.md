# Login più amichevole

Refactor di `src/components/auth/LoginForm.tsx` (unico file toccato, niente DB, niente nuove dipendenze). Tutte e 5 le richieste in un'unica passata.

## Modifiche

### 1. Link "Password dimenticata?" più visibile
Spostato da CardFooter (sotto al pulsante Accedi, oggi quasi invisibile come `variant="link"`) a una riga inline accanto alla label "Password", in stile minimal-link a destra del campo. Usa la `ForgotPasswordForm` già esistente — nessuna nuova route.

### 2. Messaggi di errore chiari
Aggiunta `classifyError(message)` che mappa il `error.message` di Supabase su 4 categorie:
- `email not confirmed` / `confirm` → "Email non confermata. Controlla la tua casella (anche lo spam) e clicca sul link di conferma prima di accedere."
- `invalid login` / `invalid credentials` / `invalid_grant` → "Email o password non corretti. Verifica i dati e riprova."
- `rate limit` / `too many` → "Troppi tentativi. Riprova fra qualche minuto."
- fallback → messaggio originale

L'errore viene mostrato come `<Alert>` inline sopra al form (variant `destructive` salvo `email_not_confirmed` che usa `default` con icona `MailWarning`). Il toast resta solo come fallback per la categoria `generic`, per non duplicare il messaggio.

### 3. Toggle Mostra/nascondi password
`useState(showPassword)` + bottone interno all'input (assolutamente posizionato a destra, `pr-10`). Icone `Eye` / `EyeOff` da lucide. `aria-label` dinamico, `tabIndex={-1}` per non rompere il flow tastiera.

### 4. Email di supporto
Riga di testo nel CardFooter sotto il pulsante: "Hai bisogno di aiuto? Contatta il tuo amministratore all'indirizzo support@gruppobenessere.it" — l'email è un `<a href="mailto:…">`. Costante `SUPPORT_EMAIL` in cima al file (facilmente modificabile in seguito o promovibile a env).

### 5. Caps Lock indicator
- `useEffect` con listener `keydown`/`keyup` su `window` che usa `e.getModifierState('CapsLock')` (globale così funziona anche durante la digitazione dell'email, non solo password).
- Quando attivo, sotto al campo password compare una riga ambra: icona `ArrowUpToLine` + "Bloc Maiusc è attivo".

## Cosa NON cambia
- Niente nuove route, niente migration, niente nuove dipendenze.
- `ForgotPasswordForm`, `ResetPassword.tsx`, `AuthContext.signIn` invariati.
- Nessun cambio testuale al titolo/CardDescription.
- Nessun update a memoria (modifica isolata, non architetturale).

## File toccati
- **Modificato**: `src/components/auth/LoginForm.tsx`
