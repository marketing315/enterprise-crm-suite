#!/usr/bin/env bash
#
# run-ralph.sh — Esegue il ralph loop per il redesign mobile.
# Rilancia lo stesso PROMPT.md finché restano task `[ ]` non bloccati in fix_plan.md.
#
# Uso:
#   bash mobile-redesign/run-ralph.sh [MAX_ITER]
#
# Requisiti: eseguibile dalla ROOT del repo; CLI dell'agente disponibile (default: `claude`).
# Personalizza AGENT_CMD se usi un altro runner.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

PROMPT_FILE="$HERE/PROMPT.md"
PLAN_FILE="$HERE/fix_plan.md"
MAX_ITER="${1:-50}"

# Comando dell'agente: riceve il prompt su stdin / come argomento.
# Esempio Claude Code in modalità non interattiva:
AGENT_CMD=(${AGENT_CMD:-claude -p})

if [[ ! -f "$PROMPT_FILE" || ! -f "$PLAN_FILE" ]]; then
  echo "ERRORE: PROMPT.md o fix_plan.md non trovati in $HERE" >&2
  exit 1
fi

remaining_tasks() {
  # Conta i task non spuntato "[ ]" (riga che inizia con eventuale spazio + "- [ ]" o "### ... [ ]")
  grep -cE '\[ \]' "$PLAN_FILE" || true
}

iter=0
while (( iter < MAX_ITER )); do
  left="$(remaining_tasks)"
  if [[ "$left" -eq 0 ]]; then
    echo "✅ Nessun task '[ ]' rimasto in fix_plan.md. Loop terminato dopo $iter iterazioni."
    exit 0
  fi

  iter=$((iter + 1))
  echo "──────────────────────────────────────────────"
  echo "▶ Iterazione $iter / $MAX_ITER  ·  task rimanenti: $left"
  echo "──────────────────────────────────────────────"

  # Passa il prompt all'agente. L'agente fa UN task, aggiorna fix_plan.md e committa.
  "${AGENT_CMD[@]}" "$(cat "$PROMPT_FILE")" || {
    echo "⚠ L'agente è uscito con errore all'iterazione $iter. Interrompo." >&2
    exit 1
  }

  # Salvaguardia: se l'agente non ha ridotto i task per più iterazioni, fermati.
  new_left="$(remaining_tasks)"
  if [[ "$new_left" -eq "$left" ]]; then
    echo "ℹ Nessun task spuntato in questa iterazione (possibile blocco). Controlla le note in fix_plan.md." >&2
  fi
done

echo "⏹ Raggiunto MAX_ITER=$MAX_ITER. Rilancia per continuare."
