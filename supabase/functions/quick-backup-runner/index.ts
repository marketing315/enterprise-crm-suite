// Quick backup runner: produce un archivio tar.gz on-demand con snapshot JSONL
// delle tabelle business per un brand. Solo lettura, whitelist hard-coded.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ROW_LIMIT_PER_TABLE = 50_000;

// Whitelist hard-coded: nessun nome tabella arbitrario può essere passato dal client
const SCOPE_TABLES: Record<string, string[]> = {
  minimal: [
    "contacts",
    "contact_phones",
    "contact_emails",
    "deals",
    "appointments",
  ],
  standard: [
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
  ],
  full: [
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
  ],
};

// Tabelle senza colonna brand_id → vengono escluse silenziosamente per safety
const TABLES_WITHOUT_BRAND_ID = new Set<string>([
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

// ───── Tar in-memory writer (USTAR) ─────
function pad(num: number, len: number): string {
  return num.toString(8).padStart(len - 1, "0") + "\0";
}
function writeString(buf: Uint8Array, str: string, offset: number, len: number) {
  const enc = new TextEncoder().encode(str);
  buf.set(enc.subarray(0, Math.min(enc.length, len)), offset);
}
function tarHeader(name: string, size: number): Uint8Array {
  const header = new Uint8Array(512);
  writeString(header, name, 0, 100);
  writeString(header, "0000644", 100, 8);
  writeString(header, pad(0, 8), 108, 8);
  writeString(header, pad(0, 8), 116, 8);
  writeString(header, pad(size, 12), 124, 12);
  writeString(header, pad(Math.floor(Date.now() / 1000), 12), 136, 12);
  // checksum placeholder = spaces
  for (let i = 148; i < 156; i++) header[i] = 0x20;
  header[156] = 0x30; // type '0' = normal file
  writeString(header, "ustar\0", 257, 6);
  writeString(header, "00", 263, 2);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  writeString(header, sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return header;
}
function tarPad(size: number): Uint8Array {
  const rem = size % 512;
  if (rem === 0) return new Uint8Array(0);
  return new Uint8Array(512 - rem);
}

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(
    new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"))
  );
  return new Uint8Array(await (await stream.blob()).arrayBuffer());
}

async function sha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validazione payload
    let payload: { brand_id?: string; scope?: string };
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brandId = payload.brand_id;
    const scope = payload.scope ?? "minimal";
    if (!brandId || !/^[0-9a-f-]{36}$/i.test(brandId)) {
      return new Response(JSON.stringify({ error: "invalid_brand_id" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tables = SCOPE_TABLES[scope];
    if (!tables) {
      return new Response(JSON.stringify({ error: "invalid_scope" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica auth: chi chiama deve essere admin/ceo del brand
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: canBackup, error: rpcErr } = await userClient.rpc(
      "assert_can_backup_brand",
      { p_brand_id: brandId }
    );
    if (rpcErr || !canBackup) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Risolve internal user id
    const { data: internalUserId } = await admin.rpc("get_user_id", {
      auth_user_id: userData.user.id,
    });

    const startedAt = Date.now();

    // Crea backup_run "running"
    const { data: runRow, error: insertErr } = await admin
      .from("backup_runs")
      .insert({
        brand_id: brandId,
        scope,
        triggered_by_user_id: internalUserId,
        tables_included: tables,
        status: "running",
      })
      .select("id")
      .single();
    if (insertErr || !runRow) {
      return new Response(
        JSON.stringify({ error: "failed_to_create_run", detail: insertErr?.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const runId = runRow.id;

    try {
      const tarChunks: Uint8Array[] = [];
      const manifest: {
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
      } = {
        version: "1",
        brand_id: brandId,
        scope,
        generated_at: new Date().toISOString(),
        run_id: runId,
        tables: [],
      };

      let totalRows = 0;
      let totalBytes = 0;
      const truncatedTables: string[] = [];

      for (const table of tables) {
        let query = admin.from(table).select("*").limit(ROW_LIMIT_PER_TABLE);
        if (!TABLES_WITHOUT_BRAND_ID.has(table)) {
          query = query.eq("brand_id", brandId);
        } else {
          // Per tabelle figlie (es. contact_phones) filtro indiretto via contact_id
          // Non implementato: esportiamo le righe collegate ai contatti del brand
          // tramite un secondo round con .in() per evitare leak cross-brand.
          // Per safety MVP: per le tabelle senza brand_id, esportiamo sempre filtrando
          // per esistenza relazione → fallback: skip se non gestibile.
          if (table === "contact_phones" || table === "contact_emails" || table === "contact_field_values") {
            const { data: contactIds } = await admin
              .from("contacts")
              .select("id")
              .eq("brand_id", brandId)
              .limit(ROW_LIMIT_PER_TABLE);
            const ids = (contactIds ?? []).map((r: any) => r.id);
            if (ids.length === 0) {
              query = admin.from(table).select("*").eq("contact_id", "00000000-0000-0000-0000-000000000000");
            } else {
              query = admin.from(table).select("*").in("contact_id", ids).limit(ROW_LIMIT_PER_TABLE);
            }
          } else if (table === "deal_stage_history") {
            const { data: dealIds } = await admin
              .from("deals").select("id").eq("brand_id", brandId).limit(ROW_LIMIT_PER_TABLE);
            const ids = (dealIds ?? []).map((r: any) => r.id);
            query = admin.from(table).select("*").in("deal_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).limit(ROW_LIMIT_PER_TABLE);
          } else if (table === "appointment_outcomes") {
            const { data: apptIds } = await admin
              .from("appointments").select("id").eq("brand_id", brandId).limit(ROW_LIMIT_PER_TABLE);
            const ids = (apptIds ?? []).map((r: any) => r.id);
            query = admin.from(table).select("*").in("appointment_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).limit(ROW_LIMIT_PER_TABLE);
          } else if (table === "ticket_events") {
            const { data: tIds } = await admin
              .from("tickets").select("id").eq("brand_id", brandId).limit(ROW_LIMIT_PER_TABLE);
            const ids = (tIds ?? []).map((r: any) => r.id);
            query = admin.from(table).select("*").in("ticket_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).limit(ROW_LIMIT_PER_TABLE);
          } else if (table === "lead_events" || table === "lead_scores") {
            const { data: cIds } = await admin
              .from("contacts").select("id").eq("brand_id", brandId).limit(ROW_LIMIT_PER_TABLE);
            const ids = (cIds ?? []).map((r: any) => r.id);
            query = admin.from(table).select("*").in("contact_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).limit(ROW_LIMIT_PER_TABLE);
          } else if (table === "ai_decision_logs") {
            // Filtro per brand via campo brand_id se presente, altrimenti skip
            query = admin.from(table).select("*").eq("brand_id", brandId).limit(ROW_LIMIT_PER_TABLE);
          }
        }

        const { data: rows, error: qErr } = await query;
        if (qErr) {
          // Tabella non esistente o errore → segnala nel manifest e continua
          manifest.tables.push({
            name: table,
            rows: 0,
            size_bytes: 0,
            truncated: false,
            sha256: "",
          });
          continue;
        }
        const list = rows ?? [];
        const truncated = list.length >= ROW_LIMIT_PER_TABLE;
        if (truncated) truncatedTables.push(table);

        const jsonl = list.map((r: any) => JSON.stringify(r)).join("\n");
        const raw = new TextEncoder().encode(jsonl);
        const compressed = await gzip(raw);
        const checksum = await sha256(compressed);

        const fname = `${table}.jsonl.gz`;
        tarChunks.push(tarHeader(fname, compressed.length));
        tarChunks.push(compressed);
        const padding = tarPad(compressed.length);
        if (padding.length) tarChunks.push(padding);

        manifest.tables.push({
          name: table,
          rows: list.length,
          size_bytes: compressed.length,
          truncated,
          sha256: checksum,
        });
        totalRows += list.length;
        totalBytes += compressed.length;
      }

      // Manifest
      const manifestBytes = new TextEncoder().encode(
        JSON.stringify(manifest, null, 2)
      );
      tarChunks.push(tarHeader("manifest.json", manifestBytes.length));
      tarChunks.push(manifestBytes);
      const mPad = tarPad(manifestBytes.length);
      if (mPad.length) tarChunks.push(mPad);

      // Tar end-of-archive: 2 blocchi zero
      tarChunks.push(new Uint8Array(1024));

      // Concat
      const total = tarChunks.reduce((a, c) => a + c.length, 0);
      const tarBuf = new Uint8Array(total);
      let off = 0;
      for (const c of tarChunks) {
        tarBuf.set(c, off);
        off += c.length;
      }
      const archive = await gzip(tarBuf);
      const archiveChecksum = await sha256(archive);
      const durationMs = Date.now() - startedAt;

      // Update run
      await admin
        .from("backup_runs")
        .update({
          status: "completed",
          total_rows: totalRows,
          size_bytes: archive.length,
          duration_ms: durationMs,
          checksum: archiveChecksum,
          truncated_tables: truncatedTables,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      // Audit
      try {
        await admin.from("audit_events").insert({
          brand_id: brandId,
          actor_user_id: internalUserId,
          entity_type: "backup",
          entity_id: runId,
          action: "backup.export",
          metadata: {
            scope,
            total_rows: totalRows,
            size_bytes: archive.length,
            duration_ms: durationMs,
            truncated_tables: truncatedTables,
          },
        });
      } catch {
        // audit_events potrebbe avere schema diverso → non bloccare
      }

      const fileName = `backup-${scope}-${brandId.slice(0, 8)}-${Date.now()}.tar.gz`;
      return new Response(archive, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "X-Backup-Run-Id": runId,
          "X-Backup-Total-Rows": String(totalRows),
          "X-Backup-Checksum": archiveChecksum,
        },
      });
    } catch (innerErr) {
      const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
      await admin
        .from("backup_runs")
        .update({
          status: "failed",
          error: msg.slice(0, 500),
          duration_ms: Date.now() - startedAt,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return new Response(
        JSON.stringify({ error: "backup_failed", detail: msg }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "internal_error", detail: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
