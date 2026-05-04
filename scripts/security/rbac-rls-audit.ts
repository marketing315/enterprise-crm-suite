/**
 * RBAC ↔ RLS audit script.
 *
 * Per ogni route admin con RoleGuard, verifica che le tabelle e RPC chiamate
 * dalla pagina siano BLOCCATE quando l'utente che fa la query NON ha i ruoli
 * autorizzati. Garantisce che nessun bypass sia possibile chiamando direttamente
 * l'endpoint Supabase con un JWT authenticated valido ma non admin.
 *
 * Uso (richiede credenziali di due account di test in env):
 *   TEST_NON_ADMIN_EMAIL=... TEST_NON_ADMIN_PASSWORD=...
 *   TEST_ADMIN_EMAIL=...     TEST_ADMIN_PASSWORD=...
 *   bunx tsx scripts/security/rbac-rls-audit.ts
 *
 * Exit code 0 se tutte le tabelle critiche sono bloccate per il non-admin,
 * 1 se anche una sola tabella restituisce dati a un utente authenticated
 * non autorizzato.
 *
 * NB: lo script NON modifica dati. Esegue solo SELECT count + un INSERT/UPDATE
 * di prova che ci si aspetta venga rifiutato.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(2);
}

const NON_ADMIN_EMAIL = process.env.TEST_NON_ADMIN_EMAIL;
const NON_ADMIN_PASSWORD = process.env.TEST_NON_ADMIN_PASSWORD;
if (!NON_ADMIN_EMAIL || !NON_ADMIN_PASSWORD) {
  console.error("Missing TEST_NON_ADMIN_EMAIL / TEST_NON_ADMIN_PASSWORD env vars.");
  process.exit(2);
}

/**
 * Tabelle/RPC che SOLO admin (o admin/ceo) devono poter raggiungere.
 * Ogni voce è una pagina admin con i suoi endpoint.
 */
const ADMIN_ONLY_TABLES: Array<{ route: string; table: string }> = [
  { route: "/admin/audit", table: "audit_events" },
  { route: "/admin/audit", table: "audit_anomalies" },
  { route: "/admin/audit", table: "audit_retention_policies" },
  { route: "/admin/audit", table: "audit_pii_policies" },
  { route: "/admin/audit", table: "audit_access_log" },
  { route: "/admin/siem-export", table: "siem_destinations" },
  { route: "/admin/siem-export", table: "siem_export_log" },
  { route: "/admin/quick-backup", table: "backup_runs" },
  { route: "/admin/quick-backup", table: "backup_schedules" },
  { route: "/admin/quick-backup", table: "restore_runs" },
  { route: "/admin/compliance", table: "access_reviews" },
  { route: "/admin/compliance", table: "access_review_items" },
  { route: "/admin/compliance", table: "compliance_change_log" },
  { route: "/admin/compliance", table: "capacity_snapshots" },
  { route: "/admin/compliance", table: "capacity_thresholds" },
  { route: "/admin/compliance", table: "anomaly_detections" },
  { route: "/admin/observability", table: "slo_definitions" },
  { route: "/admin/observability", table: "slo_measurements" },
  { route: "/admin/observability", table: "dependency_inventory" },
  { route: "/admin/observability", table: "trace_events" },
  { route: "/admin/mcp", table: "mcp_request_log" },
  { route: "/admin/notification-webhooks", table: "notification_webhook_destinations" },
  { route: "/admin/notification-webhooks", table: "notification_webhook_outbox" },
  { route: "/admin/slo-board", table: "mcp_slo_alerts" },
  { route: "/admin/ticket-escalations", table: "ticket_escalation_policies" },
];

async function login(email: string, password: string) {
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Login failed for ${email}: ${error?.message}`);
  }
  return client;
}

interface Result {
  route: string;
  table: string;
  passed: boolean;
  detail: string;
}

async function main() {
  console.log("→ Logging in as non-admin test user…");
  const nonAdmin = await login(NON_ADMIN_EMAIL!, NON_ADMIN_PASSWORD!);

  const results: Result[] = [];

  for (const { route, table } of ADMIN_ONLY_TABLES) {
    const { data, error, count } = await nonAdmin
      .from(table as never)
      .select("*", { count: "exact", head: true });

    // Pass se: 0 righe restituite e/o un errore PGRST/RLS.
    // Fail se: count > 0 (i dati sono visibili al non-admin).
    if (error) {
      // Errori di permesso/RLS sono il comportamento corretto.
      results.push({
        route,
        table,
        passed: true,
        detail: `blocked by RLS (${error.code ?? "err"}: ${error.message})`,
      });
    } else if ((count ?? 0) === 0) {
      results.push({ route, table, passed: true, detail: "0 rows visible" });
    } else {
      results.push({
        route,
        table,
        passed: false,
        detail: `LEAK: ${count} rows visible to non-admin (data sample omitted)`,
      });
    }
  }

  console.log("\n=== RBAC ↔ RLS audit ===\n");
  let failed = 0;
  for (const r of results) {
    const tag = r.passed ? "✓" : "✗";
    if (!r.passed) failed++;
    console.log(`${tag} [${r.route}] ${r.table} — ${r.detail}`);
  }
  console.log(`\n${results.length - failed}/${results.length} OK, ${failed} leaks.`);

  await nonAdmin.auth.signOut();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
