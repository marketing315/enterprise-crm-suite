# Fix login con passkey

## Diagnosi (verificata)

Il login con passkey non fallisce nel browser: fallisce perché **nel database non esiste nessuna passkey registrata**.

Verifiche fatte:

1. La tabella delle passkey (`user_passkeys`) è **completamente vuota** (0 righe).
2. L'unica riga nella tabella legacy (`user_biometric_credentials`) ha `credential_id` e `public_key` a NULL, quindi non è utilizzabile per l'autenticazione.
3. La funzione di registrazione passkey `supabase/functions/passkey-register/index.ts` **non compila**: manca la parentesi graffa di chiusura della funzione `bytesToBase64Url` (riga 186-190). Compilazione: `Unexpected end of file` a riga 198.

Conseguenza: da quando è stato introdotto quel refactor, ogni tentativo di registrare una passkey non arriva mai al database (la function non parte). Al login la challenge viene emessa correttamente (confermato dai log di rete: `passkey-auth-begin` risponde 200), il browser produce l'asserzione, ma `passkey-auth-verify` non trova nessuna credenziale corrispondente e risponde `credential_not_found`.

## Secondo problema, molto probabile (da verificare con test reale)

Sia la scrittura sia la ricerca della credenziale usano una colonna binaria (`bytea`) passando un array di byte JavaScript direttamente al client Supabase:

- `passkey-register`: `credential_id: credentialIdBytes` (upsert)
- `passkey-auth-verify`: `.eq("credential_id", credIdBytes)` (lookup)

Il client serializza l'array in JSON, quindi il valore che arriva al database non è un binario valido: la scrittura salva un valore errato e la ricerca non troverà mai la riga. Va convertito nella rappresentazione esadecimale attesa (`\x...`) in entrambi i punti.

## Terzo punto: dominio della passkey

Le passkey sono legate al dominio (`rpId`). Una passkey registrata sull'anteprima (`...lovableproject.com`) **non** funziona su `crm.gruppobenessere.it` e viceversa. Non è un bug, ma va tenuto presente nei test: la registrazione e il login vanno provati sullo stesso dominio.

## Cosa faccio

1. **Correggere l'errore di sintassi** in `passkey-register` (chiusura di `bytesToBase64Url`).
2. **Normalizzare il formato binario** di `credential_id`:
   - in `passkey-register`, convertire i byte in stringa esadecimale `\x...` prima di salvare (sia in `user_passkeys` sia nell'aggiornamento legacy);
   - in `passkey-auth-verify`, usare lo stesso formato nella ricerca su entrambe le tabelle.
3. **Migliorare la diagnostica**: log espliciti (senza dati sensibili) su registrazione riuscita/fallita e sul motivo del fallimento in verifica, così un problema simile emerge subito dai log invece che restare silenzioso.
4. **Rendere non silenzioso il fallimento in fase di attivazione**: oggi in `src/lib/biometric/client.ts` l'errore di `passkey-register` viene solo loggato in console e l'utente vede comunque "attivato". Mostrare un avviso chiaro quando la registrazione lato server non riesce.
5. **Verificare end-to-end**: compilazione delle due edge function, deploy, controllo che dopo una nuova registrazione la riga compaia in `user_passkeys` con `credential_id` e `public_key` valorizzati, e che il login vada a buon fine.

## Nota operativa

Dopo il fix sarà necessario **ri-registrare la passkey** dalle impostazioni di Sicurezza: non esistono credenziali valide da recuperare, quindi non c'è nulla da migrare.

## Dettagli tecnici

- File toccati: `supabase/functions/passkey-register/index.ts`, `supabase/functions/passkey-auth-verify/index.ts`, `src/lib/biometric/client.ts`.
- Nessuna migrazione di schema necessaria: le tabelle sono corrette, il problema è nel formato del valore scritto e nella function che non compila.
- Nessun dato viene cancellato.
