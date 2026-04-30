// Quick restore runner: parse tar.gz prodotto da quick-backup-runner,
// produce dry-run report (default) o applica restore selettivo additivo.
//
// SAFETY:
// - Whitelist hard-coded (stesse tabelle del backup).
// - Strategia default `skip` (ON CONFLICT DO NOTHING) → mai overwrite a meno che
//   il chiamante passi conflict_strategy='overwrite' E mode='apply'.
// - Forza `brand_id` di destinazione su ogni riga prima dell'insert
//   (evita cross-tenant leak se il backup è di un altro brand).
// - Solo admin/CEO del brand di destinazione (RPC assert_can_restore_brand).
// - Audit completo in `restore_runs`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Stessa whitelist di quick-backup-runner. Nessun nome arbitrario è ammesso.
const ALLOWED_TABLES = new Set([
  "contacts",
  "contact_phones",
  "contact_emails",
  "deals",
  "appointments",
  "lead_events",
  "audit_events",
  "appointment_outcomes",
  "contact_field_values",
  "deal_stage_history",
  "notifications",
  "tickets",
  "ticket_events",
  "ai_decision_logs",
  "lead_scores",
]);

const TABLES_WITHOUT_BRAND_ID = new Set([
  "contact_phones",
  "contact_emails",
  "contact_field_values",
  "deal_stage_history",
  "appointment_outcomes",
  "lead_events",
  "ticket_events",
  "ai_decision_logs",
  "lead_scores",
]);

// Tabelle "rischiose" per cui DISABILITIAMO sempre overwrite (solo skip)
const SKIP_ONLY_TABLES = new Set([
  "audit_events", // append-only
  "lead_events", // append-only
  "deal_stage_history", // append-only
  "appointment_outcomes", // append-only
]);

const BATCH_SIZE = 500;

// ───── Tar reader (USTAR) ─────
interface TarEntry {
  name: string;
  size: number;
  data: Uint8Array;
}

function parseOctal(buf: Uint8Array): number {
  // termina al primo null/space
  let end = 0;
  while (end < buf.length && buf[end] !== 0 && buf[end] !== 0x20) end++;
  const s = new TextDecoder().decode(buf.subarray(0, end)).trim();
  return s ? parseInt(s, 8) : 0;
}

function parseString(buf: Uint8Array): string {
  let end = 0;
  while (end < buf.length && buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.subarray(0, end));
}

function readTar(tar: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let off = 0;
  while (off + 512 <= tar.length) {
    const header = tar.subarray(off, off + 512);
    // blocco zero = fine archivio
    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) break;

    const name = parseString(header.subarray(0, 100));
    const size = parseOctal(header.subarray(124, 136));
    off += 512;

    if (size > 0) {
      const data = tar.subarray(off, off + size);
      entries.push({ name, size, data: new Uint8Array(data) });
      const padded = Math.ceil(size / 512) * 512;
      off += padded;
    } else {
      entries.push({ name, size: 0, data: new Uint8Array(0) });
    }
  }
  return entries;
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(
    new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"))
  );
  return new Uint8Array(await (await stream.blob()).arrayBuffer());
}

interface Manifest {
  version: string;
  brand_id: string;
  scope: string;
  generated_at: string;
  run_id: string;
  tables: Array<{
    name: string;
    rows: number;
    size_bytes: number;
    truncated: boolean;
    sha256: string;
  }>;
}

interface RestoreRequest {
  brand_id: string; // destinazione
  mode?: "dry_run" | "apply";
  conflict_strategy?: "skip" | "overwrite";
  tables?: string[]; // selettivo; se omesso → tutte quelle in archivio
  archive_base64: string; // contenuto del .tar.gz
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: RestoreRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 422);
  }

  const brandId = body.brand_id;
  const mode = body.mode ?? "dry_run";
  const conflictStrategy = body.conflict_strategy ?? "skip";
  const selected = (body.tables ?? []).filter((t) => ALLOWED_TABLES.has(t));

  if (!brandId || !/^[0-9a-f-]{36}$/i.test(brandId)) {
    return json({ error: "invalid_brand_id" }, 422);
  }
  if (!["dry_run", "apply"].includes(mode)) {
    return json({ error: "invalid_mode" }, 422);
  }
  if (!["skip", "overwrite"].includes(conflictStrategy)) {
    return json({ error: "invalid_conflict_strategy" }, 422);
  }
  if (!body.archive_base64 || typeof body.archive_base64 !== "string") {
    return json({ error: "missing_archive" }, 422);
  }

  // Auth + autorizzazione
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

  const { data: canRestore, error: rpcErr } = await userClient.rpc(
    "assert_can_restore_brand",
    { p_brand_id: brandId }
  );
  if (rpcErr || !canRestore) return json({ error: "forbidden" }, 403);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: internalUserId } = await admin.rpc("get_user_id", {
    auth_user_id: userData.user.id,
  });

  const startedAt = Date.now();

  // Decode base64 → Uint8Array
  let archive: Uint8Array;
  try {
    const binary = atob(body.archive_base64);
    archive = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) archive[i] = binary.charCodeAt(i);
  } catch {
    return json({ error: "invalid_base64" }, 422);
  }

  // Crea row di audit
  const { data: runRow, error: runErr } = await admin
    .from("restore_runs")
    .insert({
      brand_id: brandId,
      triggered_by_user_id: internalUserId,
      mode,
      conflict_strategy: conflictStrategy,
      tables_selected: selected,
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    return json({ error: "failed_to_create_run", detail: runErr?.message }, 500);
  }
  const runId = runRow.id;

  try {
    // Unzip + tar parse
    const tar = await gunzip(archive);
    const entries = readTar(tar);

    const manifestEntry = entries.find((e) => e.name === "manifest.json");
    if (!manifestEntry) throw new Error("manifest.json missing in archive");
    const manifest: Manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data));

    // Tabelle effettivamente da processare
    const archiveTables = entries
      .filter((e) => e.name.endsWith(".jsonl.gz"))
      .map((e) => e.name.replace(/\.jsonl\.gz$/, ""));
    const targetTables = (selected.length ? selected : archiveTables).filter((t) =>
      ALLOWED_TABLES.has(t) && archiveTables.includes(t)
    );

    let totalInArchive = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    const summary: Array<{
      table: string;
      in_archive: number;
      would_insert?: number;
      conflicts?: number;
      inserted?: number;
      skipped?: number;
      errors?: number;
      strategy: string;
    }> = [];

    for (const table of targetTables) {
      const entry = entries.find((e) => e.name === `${table}.jsonl.gz`);
      if (!entry) continue;

      const raw = await gunzip(entry.data);
      const text = new TextDecoder().decode(raw);
      const rows: Record<string, unknown>[] = text
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));

      totalInArchive += rows.length;

      // Forza brand_id di destinazione (se la colonna esiste nello schema)
      const hasBrandIdCol = !TABLES_WITHOUT_BRAND_ID.has(table);
      if (hasBrandIdCol) {
        for (const r of rows) r.brand_id = brandId;
      }

      // Estrai gli ID per stimare conflitti
      const ids = rows.map((r) => r.id).filter((v) => typeof v === "string") as string[];
      let existingIds = new Set<string>();
      if (ids.length) {
        // chunked select (max 500 ids per call per evitare URL troppo lunghe)
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const chunk = ids.slice(i, i + BATCH_SIZE);
          const { data: existing } = await admin
            .from(table)
            .select("id")
            .in("id", chunk);
          for (const e of existing ?? []) existingIds.add((e as { id: string }).id);
        }
      }
      const conflicts = ids.filter((id) => existingIds.has(id)).length;
      const wouldInsert = rows.length - conflicts;

      if (mode === "dry_run") {
        summary.push({
          table,
          in_archive: rows.length,
          would_insert: wouldInsert,
          conflicts,
          strategy: conflictStrategy,
        });
        continue;
      }

      // mode === 'apply'
      const effectiveStrategy = SKIP_ONLY_TABLES.has(table) ? "skip" : conflictStrategy;

      // Filtra in base alla strategia
      const toInsert =
        effectiveStrategy === "skip"
          ? rows.filter((r) => !existingIds.has(r.id as string))
          : rows; // overwrite → upsert su tutti

      let inserted = 0;
      let errors = 0;

      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const chunk = toInsert.slice(i, i + BATCH_SIZE);
        const { error: insErr } =
          effectiveStrategy === "overwrite"
            ? await admin.from(table).upsert(chunk, { onConflict: "id" })
            : await admin.from(table).insert(chunk);
        if (insErr) {
          // riprova riga per riga per non perdere tutto il batch
          for (const r of chunk) {
            const { error: singleErr } =
              effectiveStrategy === "overwrite"
                ? await admin.from(table).upsert(r, { onConflict: "id" })
                : await admin.from(table).insert(r);
            if (singleErr) errors++;
            else inserted++;
          }
        } else {
          inserted += chunk.length;
        }
      }

      const skipped = rows.length - inserted - errors;
      totalInserted += inserted;
      totalSkipped += skipped;

      summary.push({
        table,
        in_archive: rows.length,
        inserted,
        skipped,
        errors,
        strategy: effectiveStrategy,
      });
    }

    const durationMs = Date.now() - startedAt;

    await admin
      .from("restore_runs")
      .update({
        status: "completed",
        source_filename: null,
        source_run_id: manifest.run_id ?? null,
        source_brand_id: manifest.brand_id ?? null,
        source_scope: manifest.scope ?? null,
        tables_summary: summary,
        total_rows_in_archive: totalInArchive,
        total_rows_inserted: totalInserted,
        total_rows_skipped: totalSkipped,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    // audit
    try {
      await admin.from("audit_events").insert({
        brand_id: brandId,
        actor_user_id: internalUserId,
        entity_type: "restore",
        entity_id: runId,
        action: mode === "apply" ? "backup.restore" : "backup.restore_dry_run",
        metadata: {
          source_brand_id: manifest.brand_id,
          source_scope: manifest.scope,
          tables: targetTables,
          total_in_archive: totalInArchive,
          total_inserted: totalInserted,
          total_skipped: totalSkipped,
          conflict_strategy: conflictStrategy,
        },
      });
    } catch { /* non bloccare */ }

    return json({
      ok: true,
      run_id: runId,
      mode,
      manifest: {
        version: manifest.version,
        source_brand_id: manifest.brand_id,
        source_scope: manifest.scope,
        generated_at: manifest.generated_at,
        run_id: manifest.run_id,
      },
      summary,
      total_in_archive: totalInArchive,
      total_inserted: totalInserted,
      total_skipped: totalSkipped,
      duration_ms: durationMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin
      .from("restore_runs")
      .update({
        status: "failed",
        error: msg.slice(0, 500),
        duration_ms: Date.now() - startedAt,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return json({ error: "restore_failed", detail: msg, run_id: runId }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
