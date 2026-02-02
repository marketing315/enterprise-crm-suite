

# Piano: Creazione Utente Admin di Test

## Obiettivo
Creare un utente admin di test con credenziali note per poter procedere con i test E2E del CRM.

---

## Utente da Creare

| Campo | Valore |
|-------|--------|
| Email | `qa.admin@example.com` |
| Password | `Test!12345` |
| Nome | `QA Admin Test` |
| Ruolo | `admin` |
| Brand | Excell (`2dc052de-26b5-48ef-8dee-917ea591a681`) |

---

## Approccio Tecnico

### Opzione 1: Edge Function dedicata per creazione utente test (Consigliata)

Creo una edge function temporanea `create-test-user` che:

1. Accetta una chiamata con header `x-cron-secret` (nessuna auth utente richiesta)
2. Usa `adminClient.auth.admin.createUser()` per creare l'utente con password
3. Crea il record in `public.users`
4. Assegna il ruolo `admin` in `user_roles`
5. Ritorna le credenziali per conferma

```typescript
// supabase/functions/create-test-user/index.ts
const { data: authUser } = await adminClient.auth.admin.createUser({
  email: "qa.admin@example.com",
  password: "Test!12345",
  email_confirm: true,
  user_metadata: { full_name: "QA Admin Test" }
});

// Insert in public.users
await adminClient.from("users").insert({
  supabase_auth_id: authUser.user.id,
  email: "qa.admin@example.com",
  full_name: "QA Admin Test"
});

// Assign admin role
await adminClient.from("user_roles").insert({
  user_id: publicUser.id,
  brand_id: "2dc052de-26b5-48ef-8dee-917ea591a681",
  role: "admin",
  is_active: true
});
```

### Opzione 2: Usare la edge function esistente `admin-create-user`

La edge function `admin-create-user` esiste già e fa esattamente questo, ma richiede autenticazione admin - che non abbiamo.

---

## Piano di Implementazione

### Step 1: Creare Edge Function `create-test-user`

File: `supabase/functions/create-test-user/index.ts`

- Protezione con `CRON_SECRET` header
- Crea utente in auth.users con password
- Crea record in public.users
- Assegna ruolo admin a Excell
- Endpoint one-shot per testing

### Step 2: Deploy e Chiamata

Dopo il deploy, chiamo la funzione per creare l'utente.

### Step 3: Test Login

Verifico che il login funzioni con `qa.admin@example.com` / `Test!12345`.

### Step 4: Cleanup (Opzionale)

Dopo i test, l'utente puo essere rimosso o la edge function eliminata.

---

## Sicurezza

- La edge function usa `x-cron-secret` per protezione
- Crea solo un utente specifico hardcoded (non parametrico)
- Puo essere eliminata dopo l'uso

---

## File da Creare

| File | Descrizione |
|------|-------------|
| `supabase/functions/create-test-user/index.ts` | Edge function per creare utente test |

