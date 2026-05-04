#!/usr/bin/env bash
# scripts/security/check-strict-baseline.sh
#
# CI guard: misura il debito di TypeScript strict mode (strictNullChecks +
# noImplicitAny) e fallisce solo se il numero di errori CRESCE rispetto
# alla baseline registrata in `.strict-baseline`.
#
# Strategia "baseline shrinking":
# - non rompiamo il build esistente (tsconfig.app.json resta non-strict);
# - misuriamo gli errori con tsconfig.strict.json (informativo);
# - blocchiamo regressioni: se aggiungi codice non-strict-safe, fallisce.
# - quando rifattorizzi, aggiorni la baseline al nuovo numero (più basso).
#
# Workflow per il dev:
#   1. correggi tipi su un file
#   2. esegui questo script con --update per riscrivere la baseline
#   3. commit
#
# Quando .strict-baseline arriva a 0 → si può abilitare strict: true in
# tsconfig.app.json definitivamente (ed eliminare questo script).

set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

BASELINE_FILE=".strict-baseline"
UPDATE_MODE="${1:-}"

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

if ! command -v npx >/dev/null 2>&1; then
  red "✗ npx non disponibile."
  exit 2
fi

# Conta gli errori TS in modalità strict. Output formato:
#   src/foo.ts(12,3): error TS2345: ...
echo "→ Eseguo tsc -p tsconfig.strict.json (può richiedere 30-60s)…"
ERROR_COUNT=$(
  npx tsc -p tsconfig.strict.json --noEmit 2>&1 \
  | grep -E ': error TS[0-9]+:' \
  | wc -l \
  | tr -d ' '
)

echo "→ Errori strict rilevati: ${ERROR_COUNT}"

if [[ "$UPDATE_MODE" = "--update" ]]; then
  echo "$ERROR_COUNT" > "$BASELINE_FILE"
  green "✓ Baseline aggiornata a ${ERROR_COUNT} (committa $BASELINE_FILE)"
  exit 0
fi

if [[ ! -f "$BASELINE_FILE" ]]; then
  yellow "⚠ Nessuna baseline trovata. La creo con il valore corrente."
  echo "$ERROR_COUNT" > "$BASELINE_FILE"
  green "✓ Baseline iniziale: ${ERROR_COUNT}"
  exit 0
fi

BASELINE=$(cat "$BASELINE_FILE" | tr -d ' \n')

if [[ "$ERROR_COUNT" -gt "$BASELINE" ]]; then
  red "✗ REGRESSIONE strict mode: ${ERROR_COUNT} errori vs baseline ${BASELINE}."
  red "  Hai introdotto codice non strict-safe. Sistema i tipi oppure"
  red "  esegui ./scripts/security/check-strict-baseline.sh --update se davvero"
  red "  vuoi aumentare il debito (sconsigliato)."
  exit 1
elif [[ "$ERROR_COUNT" -lt "$BASELINE" ]]; then
  green "✓ Miglioramento: ${ERROR_COUNT} errori vs baseline ${BASELINE}."
  yellow "  Aggiorna la baseline: ./scripts/security/check-strict-baseline.sh --update"
  exit 0
else
  green "✓ Strict baseline invariata: ${ERROR_COUNT} errori."
  exit 0
fi
