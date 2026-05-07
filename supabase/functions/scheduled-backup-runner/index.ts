// Scheduled backup runner: invocato dal cron, esegue backup automatici per tutte
// le pianificazioni `enabled` la cui finestra (hour_utc, frequency, day_of_week)
// coincide con l'ora corrente. Carica l'archivio nello Storage privato
// `backup-archives` e applica retention pulendo i file scaduti.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  ensureBackupFolderPath,
  uploadArchiveToDrive,
  deleteDriveFile,
  isDriveConfigured,
} from "../_shared/drive-upload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ROW_LIMIT_PER_TABLE = 50_000;

const SCOPE_TABLES: Record<string, string[]> = {
  minimal: ["contacts", "contact_phones", "contact_emails", "deals", "appointments"],
  standard: [
    "contacts", "contact_phones", "contact_emails", "deals", "appointments",
    "lead_events", "audit_events", "appointment_outcomes",
    "contact_field_values", "deal_stage_history",
  ],
  full: [
    "contacts", "contact_phones", "contact_emails", "deals", "appointments",
    "lead_events", "audit_events", "appointment_outcomes",
    "contact_field_values", "deal_stage_history",
    "notifications", "tickets", "ticket_events",
    "ai_decision_logs", "lead_scores",
  ],
};

const TABLES_WITHOUT_BRAND_ID = new Set<string>([
  "contact_phones", "contact_emails", "contact_field_values",
  "deal_stage_history", "appointment_outcomes",
  "lead_events", "ticket_events", "lead_scores",
]);

// Tar USTAR
function pad(n: number, l: number): string { return n.toString(8).padStart(l - 1, "0") + "\0"; }
function ws(buf: Uint8Array, s: string, o: number, l: number) {
  const e = new TextEncoder().encode(s);
  buf.set(e.subarray(0, Math.min(e.length, l)), o);
}
function tarHeader(name: string, size: number): Uint8Array {
  const h = new Uint8Array(512);
  ws(h, name, 0, 100);
  ws(h, "0000644", 100, 8);
  ws(h, pad(0, 8), 108, 8);
  ws(h, pad(0, 8), 116, 8);
  ws(h, pad(size, 12), 124, 12);
  ws(h, pad(Math.floor(Date.now() / 1000), 12), 136, 12);
  for (let i = 148; i < 156; i++) h[i] = 0x20;
  h[156] = 0x30;
  ws(h, "ustar\0", 257, 6);
  ws(h, "00", 263, 2);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  ws(h, sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return h;
}
function tarPad(size: number): Uint8Array {
  const r = size % 512;
  return r === 0 ? new Uint8Array(0) : new Uint8Array(512 - r);
}
async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const s = new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("gzip")));
  return new Uint8Array(await (await s.blob()).arrayBuffer());
}
async function sha256(data: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function shouldRunNow(s: any, now: Date): boolean {
  if (!s.enabled) return false;

  // Dedup: mai più di un run ogni 23h per la stessa schedule
  if (s.last_run_at) {
    const last = new Date(s.last_run_at).getTime();
    if (now.getTime() - last < 23 * 3600 * 1000) return false;
  }

  const hour = now.getUTCHours();
  const targetHour = s.hour_utc ?? 0;

  if (s.frequency === "weekly") {
    const dow = s.day_of_week ?? 0;
    // Run nella finestra corretta o in catch-up nello stesso giorno
    if (dow !== now.getUTCDay()) return false;
    return hour >= targetHour;
  }

  // daily: finestra esatta o catch-up entro la stessa giornata UTC
  // (il dedup 23h evita doppi run; se ieri è stato saltato, parte oggi alla prima ora >= targetHour)
  return hour >= targetHour;
}

async function runBackupForBrand(
  admin: any,
  brandId: string,
  scope: string,
  scheduleId: string,
  retentionDays: number,
): Promise<{ ok: boolean; runId?: string; error?: string; sizeBytes?: number; rows?: number }> {
  const tables = SCOPE_TABLES[scope] ?? SCOPE_TABLES.standard;
  const startedAt = Date.now();

  const { data: runRow, error: insertErr } = await admin
    .from("backup_runs")
    .insert({
      brand_id: brandId,
      scope,
      tables_included: tables,
      status: "running",
      schedule_id: scheduleId,
    })
    .select("id")
    .single();
  if (insertErr || !runRow) return { ok: false, error: insertErr?.message ?? "insert_failed" };
  const runId = runRow.id;

  try {
    const chunks: Uint8Array[] = [];
    const manifest: any = {
      version: "1", brand_id: brandId, scope,
      generated_at: new Date().toISOString(), run_id: runId,
      scheduled: true, tables: [],
    };
    let totalRows = 0;
    let totalBytes = 0;
    const truncated: string[] = [];

    for (const table of tables) {
      let rows: any[] = [];
      try {
        if (TABLES_WITHOUT_BRAND_ID.has(table)) {
          // filtra via tabella padre
          const parentMap: Record<string, { parent: string; col: string }> = {
            contact_phones: { parent: "contacts", col: "contact_id" },
            contact_emails: { parent: "contacts", col: "contact_id" },
            contact_field_values: { parent: "contacts", col: "contact_id" },
            deal_stage_history: { parent: "deals", col: "deal_id" },
            appointment_outcomes: { parent: "appointments", col: "appointment_id" },
            lead_events: { parent: "contacts", col: "contact_id" },
            lead_scores: { parent: "contacts", col: "contact_id" },
            ticket_events: { parent: "tickets", col: "ticket_id" },
          };
          const map = parentMap[table];
          if (!map) {
            manifest.tables.push({ name: table, rows: 0, size_bytes: 0, truncated: false, sha256: "" });
            continue;
          }
          const { data: pIds } = await admin
            .from(map.parent).select("id").eq("brand_id", brandId).limit(ROW_LIMIT_PER_TABLE);
          const ids = (pIds ?? []).map((r: any) => r.id);
          if (ids.length === 0) { rows = []; }
          else {
            const { data: r } = await admin
              .from(table).select("*").in(map.col, ids).limit(ROW_LIMIT_PER_TABLE);
            rows = r ?? [];
          }
        } else {
          const { data: r } = await admin
            .from(table).select("*").eq("brand_id", brandId).limit(ROW_LIMIT_PER_TABLE);
          rows = r ?? [];
        }
      } catch {
        rows = [];
      }

      const isTrunc = rows.length >= ROW_LIMIT_PER_TABLE;
      if (isTrunc) truncated.push(table);
      const jsonl = rows.map(r => JSON.stringify(r)).join("\n");
      const raw = new TextEncoder().encode(jsonl);
      const compressed = await gzip(raw);
      const checksum = await sha256(compressed);

      const fname = `${table}.jsonl.gz`;
      chunks.push(tarHeader(fname, compressed.length));
      chunks.push(compressed);
      const p = tarPad(compressed.length);
      if (p.length) chunks.push(p);

      manifest.tables.push({ name: table, rows: rows.length, size_bytes: compressed.length, truncated: isTrunc, sha256: checksum });
      totalRows += rows.length;
      totalBytes += compressed.length;
    }

    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    chunks.push(tarHeader("manifest.json", manifestBytes.length));
    chunks.push(manifestBytes);
    const mp = tarPad(manifestBytes.length);
    if (mp.length) chunks.push(mp);
    chunks.push(new Uint8Array(1024));

    const total = chunks.reduce((a, c) => a + c.length, 0);
    const tarBuf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { tarBuf.set(c, off); off += c.length; }
    const archive = await gzip(tarBuf);
    const archiveChecksum = await sha256(archive);
    const durationMs = Date.now() - startedAt;

    // Upload su Storage
    const ts = new Date();
    const yyyy = ts.getUTCFullYear();
    const mm = String(ts.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(ts.getUTCDate()).padStart(2, "0");
    const fileName = `backup-${scope}-${ts.getTime()}.tar.gz`;
    const storagePath = `${brandId}/${yyyy}/${mm}/${dd}/${fileName}`;

    const { error: upErr } = await admin.storage
      .from("backup-archives")
      .upload(storagePath, archive, {
        contentType: "application/gzip",
        upsert: false,
      });
    if (upErr) throw new Error(`storage_upload_failed: ${upErr.message}`);

    const expiresAt = new Date(Date.now() + retentionDays * 86400 * 1000).toISOString();

    // Upload off-site su Google Drive (best-effort, non blocca il backup)
    let driveFileId: string | null = null;
    let driveWebViewLink: string | null = null;
    let driveError: string | null = null;
    let driveUploadedAt: string | null = null;
    if (isDriveConfigured()) {
      try {
        const { data: brandRow } = await admin
          .from("brands").select("name").eq("id", brandId).maybeSingle();
        const brandLabel = (brandRow?.name as string | undefined) ?? brandId.slice(0, 8);
        const folderId = await ensureBackupFolderPath(brandLabel);
        const up = await uploadArchiveToDrive(fileName, archive, folderId);
        driveFileId = up.fileId;
        driveWebViewLink = up.webViewLink;
        driveUploadedAt = new Date().toISOString();
      } catch (e) {
        driveError = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        console.error("[scheduled-backup-runner] drive upload failed", driveError);
      }
    }

    await admin.from("backup_runs").update({
      status: "completed",
      total_rows: totalRows,
      size_bytes: archive.length,
      duration_ms: durationMs,
      checksum: archiveChecksum,
      truncated_tables: truncated,
      completed_at: new Date().toISOString(),
      storage_path: storagePath,
      storage_uploaded_at: new Date().toISOString(),
      expires_at: expiresAt,
      drive_file_id: driveFileId,
      drive_uploaded_at: driveUploadedAt,
      drive_web_view_link: driveWebViewLink,
      drive_error: driveError,
    }).eq("id", runId);

    return { ok: true, runId, sizeBytes: archive.length, rows: totalRows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("backup_runs").update({
      status: "failed",
      error: msg.slice(0, 500),
      duration_ms: Date.now() - startedAt,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return { ok: false, runId, error: msg };
  }
}

async function cleanupExpired(admin: any): Promise<number> {
  const { data: expired } = await admin
    .from("backup_runs")
    .select("id, storage_path, drive_file_id")
    .or("storage_path.not.is.null,drive_file_id.not.is.null")
    .lt("expires_at", new Date().toISOString())
    .limit(200);
  if (!expired || expired.length === 0) return 0;
  let deleted = 0;
  for (const r of expired) {
    let storageOk = !r.storage_path;
    let driveOk = !r.drive_file_id;
    if (r.storage_path) {
      const { error: delErr } = await admin.storage
        .from("backup-archives").remove([r.storage_path]);
      storageOk = !delErr;
    }
    if (r.drive_file_id && isDriveConfigured()) {
      try { driveOk = await deleteDriveFile(r.drive_file_id); }
      catch { driveOk = false; }
    } else if (r.drive_file_id) {
      // Drive non configurato: lascia traccia ma non bloccare il cleanup storage
      driveOk = false;
    }
    if (storageOk && driveOk) {
      await admin.from("backup_runs").update({
        storage_path: r.storage_path ? null : r.storage_path,
        storage_uploaded_at: r.storage_path ? null : undefined,
        drive_file_id: r.drive_file_id ? null : r.drive_file_id,
        drive_uploaded_at: r.drive_file_id ? null : undefined,
        expires_at: null,
      }).eq("id", r.id);
      deleted++;
    }
  }
  return deleted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const now = new Date();

    // Pulizia file scaduti (sempre eseguita)
    const cleaned = await cleanupExpired(admin);

    // Carica pianificazioni attive
    const { data: schedules, error: sErr } = await admin
      .from("backup_schedules")
      .select("*")
      .eq("enabled", true)
      .limit(500);
    if (sErr) {
      return new Response(JSON.stringify({ error: "load_schedules_failed", detail: sErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const due = (schedules ?? []).filter((s) => shouldRunNow(s, now));
    const results: any[] = [];

    for (const s of due) {
      const r = await runBackupForBrand(admin, s.brand_id, s.scope, s.id, s.retention_days);
      results.push({ schedule_id: s.id, brand_id: s.brand_id, ...r });
      // Aggiorna last_run sulla schedule
      await admin.from("backup_schedules").update({
        last_run_at: new Date().toISOString(),
        last_run_status: r.ok ? "completed" : "failed",
      }).eq("id", s.id);
    }

    return new Response(JSON.stringify({
      ok: true,
      now: now.toISOString(),
      schedules_evaluated: schedules?.length ?? 0,
      schedules_due: due.length,
      results,
      expired_cleaned: cleaned,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "internal_error", detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
