/**
 * F5.6 — Export vista "Foglio venditori" (ESITO APPUNTAMENTI) verso Google Sheet.
 *
 * Modi:
 *  - On-demand: POST { brand_id, period_mode? }  (auth user JWT, deve essere admin/responsabile_venditori del brand o admin/CEO globale)
 *  - Sweep   : POST { sweep: true }              (header x-cron-secret = CRON_SECRET) — esegue tutte le config con cron_enabled
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SVC_KEY = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const HEADERS = [
  "Venditore","Email","Programmati","Eseguiti","No-show","Cancellati","% Esecuzione",
  "Ordini venduti","% Vendita","Lordo €","Imponibile €","Consegnati","% Consegne",
  "Tier","Bonus €",
];

type Period = "current_month" | "previous_month" | "last_30d" | "ytd";

function resolveRange(p: Period): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (p === "current_month") {
    return { from: new Date(Date.UTC(y, m, 1)).toISOString(), to: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59)).toISOString() };
  }
  if (p === "previous_month") {
    return { from: new Date(Date.UTC(y, m - 1, 1)).toISOString(), to: new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString() };
  }
  if (p === "last_30d") {
    return { from: new Date(now.getTime() - 30 * 86400_000).toISOString(), to: now.toISOString() };
  }
  return { from: new Date(Date.UTC(y, 0, 1)).toISOString(), to: now.toISOString() };
}

// ============ Google Sheets helpers (JWT service-account) ============

async function getAccessToken(serviceAccountKey: string): Promise<string> {
  const key = JSON.parse(serviceAccountKey);
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const encoder = new TextEncoder();
  const b64 = (s: string) => btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const headerB64 = b64(JSON.stringify(header));
  const payloadB64 = b64(JSON.stringify(payload));
  const unsigned = `${headerB64}.${payloadB64}`;
  const pem = key.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const bin = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const ck = await crypto.subtle.importKey("pkcs8", bin, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", ck, encoder.encode(unsigned));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = `${unsigned}.${sigB64}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Google token error: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function ensureTab(token: string, spreadsheetId: string, tabName: string): Promise<number> {
  const meta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then((r) => r.json());
  const found = meta.sheets?.find((s: { properties: { title: string; sheetId: number } }) => s.properties.title === tabName);
  if (found) return found.properties.sheetId;
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
  }).then((x) => x.json());
  return r.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
}

async function clearTab(token: string, spreadsheetId: string, tabName: string) {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}:clear`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
}

async function writeValues(token: string, spreadsheetId: string, range: string, values: (string | number)[][]) {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
  if (!r.ok) throw new Error(`Sheets write failed [${r.status}]: ${await r.text()}`);
}

async function formatHeader(token: string, spreadsheetId: string, sheetId: number, cols: number) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
        { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: cols } } } },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
            cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.2, green: 0.4, blue: 0.6 } } },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
        { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: cols } } },
      ],
    }),
  });
}

// ============ Core export ============

interface Cfg {
  brand_id: string;
  spreadsheet_id: string;
  tab_name: string;
  period_mode: Period;
}

interface Row {
  full_name?: string; email?: string;
  appuntamenti_programmati?: number; appuntamenti_eseguiti?: number;
  no_show?: number; cancellati?: number; perc_esecuzione?: number;
  ordini_venduti?: number; perc_vendita?: number;
  lordo?: number; imponibile?: number;
  consegnati_periodo?: number; perc_consegne_periodo?: number;
  bonus?: { tier_label?: string; bonus_amount?: number };
}

async function exportForBrand(admin: ReturnType<typeof createClient>, token: string, cfg: Cfg) {
  const { from, to } = resolveRange(cfg.period_mode);

  const { data, error } = await admin.rpc("get_salesperson_kpis_v2", {
    p_brand_id: cfg.brand_id,
    p_from: from,
    p_to: to,
    p_user_ids: null,
  });
  if (error) throw new Error(`RPC error: ${error.message}`);

  const rows: Row[] = (data as { rows?: Row[] } | null)?.rows ?? [];

  const metaRow = [
    `Periodo: ${cfg.period_mode}`, `${from.slice(0, 10)} → ${to.slice(0, 10)}`,
    `Aggiornato: ${new Date().toISOString()}`, "", "", "", "", "", "", "", "", "", "", "", "",
  ];

  const dataRows = rows.map((r) => [
    r.full_name ?? "", r.email ?? "",
    r.appuntamenti_programmati ?? 0, r.appuntamenti_eseguiti ?? 0,
    r.no_show ?? 0, r.cancellati ?? 0,
    Number(r.perc_esecuzione ?? 0),
    r.ordini_venduti ?? 0, Number(r.perc_vendita ?? 0),
    Number(r.lordo ?? 0), Number(r.imponibile ?? 0),
    r.consegnati_periodo ?? 0, Number(r.perc_consegne_periodo ?? 0),
    r.bonus?.tier_label ?? "", Number(r.bonus?.bonus_amount ?? 0),
  ]);

  const sheetId = await ensureTab(token, cfg.spreadsheet_id, cfg.tab_name);
  await clearTab(token, cfg.spreadsheet_id, cfg.tab_name);
  await writeValues(token, cfg.spreadsheet_id, `${cfg.tab_name}!A1`, [HEADERS, metaRow, ...dataRows]);
  await formatHeader(token, cfg.spreadsheet_id, sheetId, HEADERS.length);

  return rows.length;
}

async function recordLog(admin: ReturnType<typeof createClient>, cfgId: string, brandId: string, status: string, rows: number, err?: string) {
  await admin.from("sheets_export_logs").insert({
    brand_id: brandId,
    tab_name: "PERFORMANCE",
    status,
    rows_exported: rows,
    error: err ?? null,
  });
  await admin.from("brand_perf_sheet_config").update({
    last_export_at: new Date().toISOString(),
    last_status: status,
    last_error: err ?? null,
    last_rows_exported: rows,
  }).eq("id", cfgId);
}

// ============ Handler ============

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!SVC_KEY) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not configured");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const isSweep = body?.sweep === true;

    if (isSweep) {
      const incoming = req.headers.get("x-cron-secret") ?? "";
      if (!CRON_SECRET || !timingSafeEqual(incoming, CRON_SECRET)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const token = await getAccessToken(SVC_KEY);
      const { data: configs } = await admin
        .from("brand_perf_sheet_config")
        .select("id, brand_id, spreadsheet_id, tab_name, period_mode")
        .eq("cron_enabled", true);

      const results: Array<{ brand_id: string; ok: boolean; rows?: number; error?: string }> = [];
      for (const c of (configs ?? [])) {
        try {
          const n = await exportForBrand(admin, token, c as unknown as Cfg);
          await recordLog(admin, (c as { id: string }).id, c.brand_id as string, "success", n);
          results.push({ brand_id: c.brand_id as string, ok: true, rows: n });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await recordLog(admin, (c as { id: string }).id, c.brand_id as string, "failed", 0, msg);
          results.push({ brand_id: c.brand_id as string, ok: false, error: msg });
        }
      }
      return new Response(JSON.stringify({ ok: true, processed: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // On-demand: richiede JWT utente con permessi sul brand
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const brandId = body?.brand_id as string | undefined;
    const periodOverride = body?.period_mode as Period | undefined;
    if (!brandId) {
      return new Response(JSON.stringify({ error: "brand_id required" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Leggi config via user client → RLS verifica i permessi automaticamente
    const { data: cfg, error: cfgErr } = await userClient
      .from("brand_perf_sheet_config")
      .select("id, brand_id, spreadsheet_id, tab_name, period_mode")
      .eq("brand_id", brandId)
      .maybeSingle();
    if (cfgErr) {
      return new Response(JSON.stringify({ error: cfgErr.message }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!cfg) {
      return new Response(JSON.stringify({ error: "No sheet configured for this brand" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const effective = { ...cfg, period_mode: (periodOverride ?? cfg.period_mode) as Period } as unknown as Cfg;

    const token = await getAccessToken(SVC_KEY);
    try {
      const n = await exportForBrand(admin, token, effective);
      await recordLog(admin, (cfg as { id: string }).id, brandId, "success", n);
      return new Response(JSON.stringify({ ok: true, rows: n }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordLog(admin, (cfg as { id: string }).id, brandId, "failed", 0, msg);
      throw e;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("sheets-export-performance error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
