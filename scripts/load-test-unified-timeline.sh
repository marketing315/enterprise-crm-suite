#!/usr/bin/env bash
# Load test for `get_unified_customer_timeline` via direct psql.
# Measures pure DB latency (no PostgREST/JWT overhead) — meant to be the SLO baseline.
# Companion to scripts/load-test-unified-timeline.js (which exercises the full edge stack).
#
# Usage:
#   ITERATIONS=200 CONCURRENCY=8 LIMIT=200 bash scripts/load-test-unified-timeline.sh
# Output:
#   /mnt/documents/load-test-unified-timeline-psql.md

set -euo pipefail

ITERATIONS="${ITERATIONS:-200}"
CONCURRENCY="${CONCURRENCY:-8}"
LIMIT="${LIMIT:-200}"
OUT="/mnt/documents/load-test-unified-timeline-psql.md"
TMP="$(mktemp -d)"
mkdir -p /mnt/documents

if [ -z "${PGHOST:-}" ]; then
  echo "PGHOST not set — psql access required" >&2
  exit 1
fi

# 1. Sample 50 most-recent contact ids
psql -t -A -c "SELECT id FROM contacts ORDER BY last_interaction_at DESC NULLS LAST LIMIT 50" \
  > "$TMP/contacts.txt"
N_CONTACTS=$(wc -l < "$TMP/contacts.txt")
if [ "$N_CONTACTS" -eq 0 ]; then
  echo "No contacts found in DB" >&2
  exit 2
fi

# 2. Worker: runs ITERATIONS/CONCURRENCY calls, writes "<ms>\t<rows>" lines
worker() {
  local worker_id="$1"
  local n="$2"
  local outfile="$TMP/worker_${worker_id}.txt"
  : > "$outfile"
  local i=0
  while [ "$i" -lt "$n" ]; do
    local idx=$(( (worker_id * n + i) % N_CONTACTS + 1 ))
    local cid
    cid=$(sed -n "${idx}p" "$TMP/contacts.txt")
    # \timing prints: "Time: 12.345 ms" on stderr; we count rows from stdout.
    local out
    out=$(psql -At -c "\timing on" \
      -c "SELECT count(*) FROM get_unified_customer_timeline('${cid}'::uuid, ${LIMIT});" 2>&1) || true
    local rows ms
    rows=$(printf '%s\n' "$out" | grep -E '^[0-9]+$' | head -1 || echo 0)
    ms=$(printf '%s\n' "$out" | grep -oE 'Time: [0-9.]+ ms' | head -1 | awk '{print $2}')
    if [ -n "$ms" ]; then
      printf '%s\t%s\n' "$ms" "${rows:-0}" >> "$outfile"
    fi
    i=$((i + 1))
  done
}

PER_WORKER=$(( ITERATIONS / CONCURRENCY ))
START=$(date +%s%N)
for w in $(seq 0 $((CONCURRENCY - 1))); do
  worker "$w" "$PER_WORKER" &
done
wait
END=$(date +%s%N)
WALL_MS=$(( (END - START) / 1000000 ))

# 3. Aggregate
cat "$TMP"/worker_*.txt > "$TMP/all.txt"
TOTAL=$(wc -l < "$TMP/all.txt")

if [ "$TOTAL" -eq 0 ]; then
  echo "No samples collected" >&2
  exit 3
fi

# Sort latencies for percentiles
awk -F'\t' '{print $1}' "$TMP/all.txt" | sort -n > "$TMP/lat_sorted.txt"

pct() {
  local p="$1"
  awk -v p="$p" 'BEGIN{c=0}{a[++c]=$1}END{
    idx=int((p/100)*c+0.999); if(idx<1)idx=1; if(idx>c)idx=c; print a[idx]
  }' "$TMP/lat_sorted.txt"
}

MIN=$(head -1 "$TMP/lat_sorted.txt")
MAX=$(tail -1 "$TMP/lat_sorted.txt")
AVG=$(awk '{s+=$1}END{printf "%.2f", s/NR}' "$TMP/lat_sorted.txt")
P50=$(pct 50)
P95=$(pct 95)
P99=$(pct 99)
ROWS_AVG=$(awk -F'\t' '{s+=$2}END{printf "%.1f", s/NR}' "$TMP/all.txt")
ROWS_MAX=$(awk -F'\t' '{if($2>m)m=$2}END{print m+0}' "$TMP/all.txt")
THROUGHPUT=$(awk -v t="$TOTAL" -v w="$WALL_MS" 'BEGIN{printf "%.2f", (t/w)*1000}')

# SLO checks (pure DB target tighter than full-stack)
slo_p95="✅ PASS"; awk -v v="$P95" 'BEGIN{exit !(v>150)}' && slo_p95="❌ FAIL"
slo_p99="✅ PASS"; awk -v v="$P99" 'BEGIN{exit !(v>400)}' && slo_p99="❌ FAIL"

cat > "$OUT" <<EOF
# Load Test — \`get_unified_customer_timeline\` (psql direct)

**Run at:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")
**Config:** iterations=${ITERATIONS} (effective=${TOTAL}), concurrency=${CONCURRENCY}, p_limit=${LIMIT}
**Sample contacts:** ${N_CONTACTS} (top by last_interaction_at)
**Mode:** direct psql (measures pure DB latency, no PostgREST/JWT overhead)

## 📊 Latency (ms)

| Metric | Value |
|---|---|
| Samples | ${TOTAL} |
| Wall time | $(awk -v w="$WALL_MS" 'BEGIN{printf "%.2f", w/1000}') s |
| Throughput | ${THROUGHPUT} req/s |
| min | ${MIN} |
| avg | ${AVG} |
| **p50** | **${P50}** |
| **p95** | **${P95}** |
| **p99** | **${P99}** |
| max | ${MAX} |

## 🔢 Result size (rows returned)

| Metric | Value |
|---|---|
| avg | ${ROWS_AVG} |
| max | ${ROWS_MAX} |

## ✅ SLO assessment (DB-direct targets)

- p95 ≤ 150 ms → ${slo_p95}
- p99 ≤ 400 ms → ${slo_p99}

> The full-stack JS load test (\`scripts/load-test-unified-timeline.js\`) uses
> looser SLOs (p95 ≤ 300 ms, p99 ≤ 800 ms) to account for PostgREST + network.
EOF

echo "✅ Report written to $OUT"
echo "   samples=${TOTAL} p50=${P50}ms p95=${P95}ms p99=${P99}ms throughput=${THROUGHPUT} req/s"
rm -rf "$TMP"
