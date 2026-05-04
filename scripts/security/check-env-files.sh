#!/usr/bin/env bash
# scripts/security/check-env-files.sh
#
# CI guard: blocca il commit se vengono trovati file env locali con valori
# reali (non placeholder). Va eseguito in CI prima di build/test.
#
# Cosa controlla:
#   1. Esistono file `.env.e2e`, `.env.local`, `.env.*.local` nel working tree?
#      Se sì → exit 1 (devono restare locali, non committati).
#   2. Il file `.env.e2e.example` (versionato) contiene ancora i placeholder?
#      Se contiene `password123` o `admin@example.com` come VALORE EFFETTIVO,
#      è un regression: i placeholder devono essere palesemente fake.
#   3. Il file `.env` (gestito da Lovable Cloud) contiene SOLO chiavi pubbliche?
#      Se intercetta pattern noti di service-role/secret → exit 1.
#
# NB: `.env` è intenzionalmente versionato perché contiene solo la
# publishable/anon key e l'URL pubblico (esposti comunque nel bundle).
# Spostarli a "build secret" non aumenta la sicurezza: sono `VITE_*`,
# Vite li inlina nel JS pubblico in ogni caso.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

fail=0

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

# ── 1. file env locali non devono mai esistere committati ───────────────
LOCAL_ENV_FILES=(
  ".env.e2e"
  ".env.local"
  ".env.development.local"
  ".env.production.local"
  ".env.test.local"
)

for f in "${LOCAL_ENV_FILES[@]}"; do
  # tracciato in git?
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    red "✗ $f è tracciato da git. Rimuovi dal repo: git rm --cached $f"
    fail=1
  fi
  # presente sul disco con contenuto non vuoto?
  if [[ -s "$f" ]]; then
    yellow "⚠ $f esiste localmente con contenuto. Assicurati che NON venga committato."
    # In CI questo è un fallimento perché significa che è stato copiato nell'image.
    if [[ "${CI:-}" = "true" ]] || [[ "${GITHUB_ACTIONS:-}" = "true" ]]; then
      red "✗ In ambiente CI il file $f non deve esistere."
      fail=1
    fi
  fi
done

# ── 2. .env.e2e.example deve contenere solo placeholder, non credenziali reali ──
if [[ -f ".env.e2e.example" ]]; then
  # I placeholder PALESI (PLACEHOLDER_…, openssl_rand…) sono ok.
  # Le credenziali "deboli" tipo password123 / admin@example.com NO,
  # perché qualcuno potrebbe riutilizzarle in staging.
  if grep -E '^[A-Z_]+=password123$' .env.e2e.example >/dev/null; then
    red "✗ .env.e2e.example contiene 'password123' come valore. Sostituisci con un placeholder esplicito."
    fail=1
  fi
  if grep -E '^[A-Z_]+=admin@example\.com$' .env.e2e.example >/dev/null; then
    red "✗ .env.e2e.example contiene 'admin@example.com' come valore. Sostituisci con un placeholder esplicito."
    fail=1
  fi
fi

# ── 3. .env non deve mai contenere chiavi privati/service_role ──────────
if [[ -f ".env" ]]; then
  # Match SOLO se compaiono come NOME variabile (a inizio riga, prima di '=').
  # Evita falsi positivi sui claim JSON dentro la JWT publishable.
  DANGEROUS_VAR_NAMES=(
    'SUPABASE_SERVICE_ROLE_KEY'
    'SERVICE_ROLE_KEY'
    'INTERNAL_SERVICE_TOKEN'
    'CRON_SECRET'
    'STRIPE_SECRET_KEY'
    'OPENAI_API_KEY'
    'LOVABLE_API_KEY'
  )
  for var in "${DANGEROUS_VAR_NAMES[@]}"; do
    if grep -E "^${var}=" .env >/dev/null 2>&1; then
      red "✗ .env definisce variabile sensibile '${var}'. Spostala nei Cloud secrets."
      fail=1
    fi
  done
  # Pattern valore-only inequivocabili
  if grep -E '=sk_live_[A-Za-z0-9]+' .env >/dev/null 2>&1; then
    red "✗ .env contiene una Stripe live secret key. Rimuovi e ruota immediatamente."
    fail=1
  fi
fi

if [[ $fail -eq 0 ]]; then
  green "✓ env files OK"
  exit 0
fi
exit 1
