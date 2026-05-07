#!/usr/bin/env node
/**
 * Fallisce se una nuova migration crea una tabella con nome log-pattern
 * (append-only) senza dichiarare retention.
 *
 * Trigger: incident P1 disco pieno 7 maggio 2026 (cron.job_run_details +
 * net._http_response saturati). Vedi docs/db-retention-policy.md e
 * docs/decisions/ADR-001-retention-mandatory.md.
 *
 * Uso: node scripts/ci/check-retention-policy.mjs <changed-files...>
 * In CI: passa l'output di `git diff --name-only origin/main...HEAD -- supabase/migrations/*.sql`.
 *
 * Pattern accettati per dichiarare retention:
 *   - commento "-- retention: N giorni" (qualunque variante)
 *   - cron.schedule(...) con DELETE associata
 *   - PARTITION BY RANGE (...)
 *   - pg_partman
 *   - escape "-- @no-retention-needed: <motivazione>" (richiede motivazione esplicita)
 */

import fs from "node:fs";

const LOG_PATTERN_SUFFIX = [
  "_log", "_logs", "_events", "_history", "_audit", "_audits",
  "_trace", "_traces", "_attempts", "_runs", "_executions",
  "_queue", "_queues", "_dlq", "_jobs", "_requests", "_responses",
  "_stats", "_metrics", "_telemetry", "_measurements",
  "_dispatches", "_deliveries", "_changes", "_relay",
];

const RETENTION_DECLARATION_RE = [
  /--\s*retention\s*:/i,
  /pg_cron|cron\.schedule/i,
  /create\s+.*partition/i,
  /pg_partman/i,
  /--\s*@no-retention-needed\s*:\s*\S/i, // richiede motivazione (almeno un char dopo i due punti)
];

function checkSql(file, sql) {
  const errors = [];

  const tableMatches = [
    ...sql.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[a-z_]+\.)?["']?(\w+)["']?/gi,
    ),
  ];

  for (const m of tableMatches) {
    const tableName = m[1].toLowerCase();
    const isLogPattern = LOG_PATTERN_SUFFIX.some((s) => tableName.endsWith(s));
    if (!isLogPattern) continue;

    const hasRetention = RETENTION_DECLARATION_RE.some((re) => re.test(sql));
    if (!hasRetention) {
      errors.push(
        `❌ ${file}: tabella "${tableName}" sembra append-only ma non dichiara retention.\n` +
          `   Aggiungi nel migration uno dei seguenti:\n` +
          `   - commento "-- retention: N giorni" + cron.schedule(...) di cleanup\n` +
          `   - PARTITION BY RANGE (created_at) con strategia di drop\n` +
          `   - oppure marker esplicito "-- @no-retention-needed: <motivazione>" se davvero non serve`,
      );
    }

    // Check secondario: se ha colonna timestamp tipica, deve avere indice su di essa
    const hasTimestampCol =
      /\b(created_at|end_time|received_at|measured_at|logged_at|occurred_at|emitted_at|"timestamp")\b/i
        .test(sql);
    const hasIndexOnTimestamp =
      /CREATE\s+INDEX[^;]*\bON\s+[\w.]+\s*\([^)]*(?:created_at|end_time|received_at|measured_at|logged_at|occurred_at|emitted_at|timestamp)/i
        .test(sql);
    if (hasTimestampCol && !hasIndexOnTimestamp) {
      errors.push(
        `⚠️  ${file}: tabella "${tableName}" ha colonna timestamp ma nessun indice su di essa. ` +
          `Le DELETE di retention saranno lente. Aggiungi CREATE INDEX ON ${tableName}(<timestamp_col>).`,
      );
    }
  }

  return errors;
}

function main(argv) {
  const files = argv
    .filter((f) => f.startsWith("supabase/migrations/") && f.endsWith(".sql"));

  const allErrors = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, "utf-8");
    allErrors.push(...checkSql(file, sql));
  }

  if (allErrors.length > 0) {
    console.error("🚫 Retention policy check failed:\n");
    for (const e of allErrors) console.error(e + "\n");
    console.error(
      "\nVedi docs/db-retention-policy.md per dettagli su come dichiarare retention.\n" +
        'Se sei convinto che la tua tabella non accumuli, aggiungi "-- @no-retention-needed: <motivazione>" nel file SQL.',
    );
    process.exit(1);
  }

  console.log(
    `✅ Retention check OK (${files.length} migration file analizzati).`,
  );
}

// Esporta per i test
export { checkSql, LOG_PATTERN_SUFFIX, RETENTION_DECLARATION_RE };

// Entry-point CLI: esegui solo se invocato direttamente
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  main(process.argv.slice(2));
}
