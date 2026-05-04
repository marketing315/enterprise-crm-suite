# TypeScript strict mode — piano di migrazione

## Stato attuale (snapshot 2026-05-04)
- `tsconfig.app.json`: `strict: false`, `strictNullChecks: false`, `noImplicitAny: false`
- 52 file con `as any` / `: any` (124 occorrenze totali)
- Lint `@typescript-eslint/no-unused-vars`: era `off` → ora `warn`
- Lint `@typescript-eslint/no-explicit-any`: nuovo, `error` su tutti i nuovi file, `warn` sui 52 legacy

Abilitare `strict: true` di colpo romperebbe migliaia di righe e bloccherebbe ogni build successivo. Procediamo gradualmente.

## Step 1 — Guardrail (FATTO)
- ✅ `eslint.config.js`: `@typescript-eslint/no-explicit-any: error` con array `ANY_BASELINE` di 52 file legacy declassati a `warn`.
- ✅ `tsconfig.strict.json`: file separato che eredita `tsconfig.app.json` ma abilita `strict: true`. Solo informativo, NON usato dal build di produzione.
- ✅ `scripts/security/check-strict-baseline.sh`: misura il numero di errori strict, salva la baseline in `.strict-baseline`, fallisce in CI se cresce.

**Workflow per il dev:**
1. La prima volta esegui lo script: crea `.strict-baseline` con il valore attuale → committalo.
2. Quando rifattorizzi tipi, ri-esegui con `--update` per abbassare la baseline.
3. Quando arrivi a 0 → vai allo Step 2.

## Step 2 — strictNullChecks
1. Imposta `strictNullChecks: true` in `tsconfig.app.json` (ed elimina `noImplicitAny: false` se ancora presente).
2. Rimuovi `tsconfig.strict.json` e lo script baseline.
3. Sistema gli ultimi residui (saranno pochi se la baseline è 0).

## Step 3 — strict completo
1. Imposta `strict: true`, rimuovi tutti gli override `false`.
2. Abilita `noImplicitReturns`, `noFallthroughCasesInSwitch`.
3. Considera `noUncheckedIndexedAccess: true` (separatamente, è un cambio invasivo).
4. Promuovi `@typescript-eslint/no-unused-vars` da `warn` a `error`.

## Come ripulire un file dalla baseline `any`
1. Apri il file, sostituisci ogni `any` con il tipo corretto. Suggerimenti:
   - per RPC Supabase: usa il tipo da `Database["public"]["Functions"]["nome_rpc"]["Returns"]`
   - per chiamate `.from("tabella")`: i tipi sono già inferiti dal client generato
   - per JSON arbitrari (es. `metadata`): tipizza con `Record<string, unknown>` non `any`
   - per error caught: usa `unknown` e fai narrowing con `instanceof Error`
2. Esegui `npx eslint <file>` — se passa, rimuovi il path da `ANY_BASELINE` in `eslint.config.js`.
3. Esegui `bash scripts/security/check-strict-baseline.sh --update` per riallineare la baseline.

## Casi pericolosi che `any` nasconde nel nostro codice
- Drift dei contratti RPC: il backend cambia signature, il frontend continua a compilare.
- Null-safety nei dati Supabase: campi nullable trattati come definiti (`.user.email` su user nullable).
- Tipi degli edge function payload: oggi sono spesso `any`, vanno tipizzati con Zod schemas in `_shared/`.
