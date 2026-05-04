#!/usr/bin/env bash
# check-edge-functions-config.sh
#
# CI guard: every directory under supabase/functions/ (except _shared) MUST
# have an explicit [functions.<name>] block in supabase/config.toml.
#
# Bare directories inherit the Supabase platform default (verify_jwt = true)
# under the signing-keys system, which silently breaks cron-relay targets,
# inter-function calls (x-internal-token), HMAC webhooks, and MCP token auth.
#
# See docs/edge-functions-auth-map.md for the full matrix.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FUNCS_DIR="$ROOT/supabase/functions"
CONFIG="$ROOT/supabase/config.toml"

if [ ! -d "$FUNCS_DIR" ]; then
  echo "::error::supabase/functions directory not found at $FUNCS_DIR"
  exit 1
fi

if [ ! -f "$CONFIG" ]; then
  echo "::error::supabase/config.toml not found at $CONFIG"
  exit 1
fi

missing=()
declared=()

# Collect declared function names from config.toml.
# Matches lines like `  [functions.my-fn]` (whitespace tolerant).
while IFS= read -r name; do
  declared+=("$name")
done < <(grep -E '^\s*\[functions\.[a-z0-9_-]+\]\s*$' "$CONFIG" \
         | sed -E 's/^\s*\[functions\.([a-z0-9_-]+)\]\s*$/\1/')

# Walk every function directory.
while IFS= read -r dir; do
  name="$(basename "$dir")"
  case "$name" in
    _*) continue ;;  # _shared and similar conventions
  esac
  found=0
  for d in "${declared[@]}"; do
    if [ "$d" = "$name" ]; then
      found=1
      break
    fi
  done
  if [ "$found" -eq 0 ]; then
    missing+=("$name")
  fi
done < <(find "$FUNCS_DIR" -mindepth 1 -maxdepth 1 -type d | sort)

# Detect orphan declarations: name in config.toml that has no directory.
orphans=()
for d in "${declared[@]}"; do
  if [ ! -d "$FUNCS_DIR/$d" ]; then
    orphans+=("$d")
  fi
done

failed=0

if [ ${#missing[@]} -gt 0 ]; then
  echo ""
  echo "::error::Edge functions missing from supabase/config.toml:"
  for m in "${missing[@]}"; do
    echo "  - $m"
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
      echo "::error file=supabase/config.toml::Function '$m' is not declared. Without an explicit block it inherits verify_jwt=true and may break cron/internal/HMAC callers. See docs/edge-functions-auth-map.md."
    fi
  done
  echo ""
  echo "Add an explicit block, e.g.:"
  echo ""
  echo "  [functions.${missing[0]}]"
  echo "    verify_jwt = false   # describe the auth pattern"
  echo ""
  failed=1
fi

if [ ${#orphans[@]} -gt 0 ]; then
  echo ""
  echo "::warning::Orphan declarations in supabase/config.toml (no matching directory):"
  for o in "${orphans[@]}"; do
    echo "  - $o"
  done
  # Orphans are a warning, not a hard failure — they may be deploy-only.
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi

echo "OK: ${#declared[@]} edge functions declared, all directories accounted for."
