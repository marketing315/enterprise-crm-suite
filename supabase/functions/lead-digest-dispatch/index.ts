import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    // Decode JWT payload without verification to inspect role/iss
    // (signature is verified by Supabase infra; we trust the token is valid if it reaches us)
    function decodeJwtPayload(token: string): Record<string, unknown> | null {
      try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const json = atob(padded.padEnd(padded.length + (4 - padded.length % 4) % 4, "="));
        return JSON.parse(json);
      } catch { return null; }
    }

    let isSystemCall = false; // cron or service role
    let isAdminCall = false;
    let userId: string | null = null;
    let triggerType: string = "scheduled";

    if (bearerToken) {
      const payload = decodeJwtPayload(bearerToken);
      const role = payload?.role as string | undefined;

      if (role === "anon" || role === "service_role") {
        // pg_cron uses anon key; service role used by internal systems
        isSystemCall = true;
      } else if (role === "authenticated") {
        // Human user: check if admin/ceo
        const verifyClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || bearerToken, {
          global: { headers: { Authorization: authHeader! } },
        });
        const { data: userData } = await verifyClient.auth.getUser(bearerToken);
        if (!userData?.user) {
          return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: internalUser } = await supabase
          .from("users").select("id")
          .eq("supabase_auth_id", userData.user.id).maybeSingle();
        if (!internalUser?.id) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = internalUser.id;
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
        if (!roles?.some((r) => r.role === "admin" || r.role === "ceo")) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        isAdminCall = true;
        triggerType = "manual";
      }
    }

    if (!isSystemCall && !isAdminCall) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch { /* no body */ }

    const forceWindowStart: string | null = (body.force_window_start as string) || null;
    const forceWindowEnd: string | null = (body.force_window_end as string) || null;
    if (body.trigger_type) triggerType = body.trigger_type as string;

    // ── Load config ──
    const { data: config, error: configErr } = await supabase
      .from("lead_digest_config")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    if (configErr || !config) {
      return new Response(JSON.stringify({ error: "Config not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!config.is_enabled && triggerType === "scheduled") {
      console.log("[lead-digest-dispatch] Digest disabled, skipping scheduled run");
      return new Response(JSON.stringify({ skipped: true, reason: "disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Slot check for scheduled runs ──
    if (triggerType === "scheduled") {
      const tz = config.timezone || "Europe/Rome";
      // Robust timezone-aware time parsing using Intl.DateTimeFormat
      const now = new Date();
      const tzFormatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = tzFormatter.formatToParts(now);
      const h = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
      const m = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
      const currentHHMM = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

      console.log(`[lead-digest-dispatch] Scheduled check at ${currentHHMM} (${tz}), slots: ${JSON.stringify(config.schedule_times)}`);

      const slots: string[] = config.schedule_times || ["12:00", "16:30"];
      // Widen matching window to ±2 minutes to survive cold-starts and redeploys
      const currentTotalMin = h * 60 + m;
      const isInSlot = slots.some((slot: string) => {
        const [sh, sm] = slot.split(":").map(Number);
        const slotTotalMin = sh * 60 + sm;
        const diff = Math.abs(currentTotalMin - slotTotalMin);
        return diff <= 2 || diff >= (24 * 60 - 2); // handle midnight wrap
      });

      if (!isInSlot) {
        console.log(`[lead-digest-dispatch] Not a send slot (${currentHHMM}), skipping`);
        return new Response(JSON.stringify({ skipped: true, reason: "not_in_slot", current_time: currentHHMM }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[lead-digest-dispatch] Matched send slot at ${currentHHMM}`);

      // Anti-duplicate: check if already sent within last 5 minutes (covers the ±2 min window)
      const dedupeWindow = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentRun } = await supabase
        .from("lead_digest_runs")
        .select("id, created_at")
        .in("status", ["sent", "pending"])
        .eq("trigger_type", "scheduled")
        .gte("created_at", dedupeWindow)
        .limit(1)
        .maybeSingle();

      if (recentRun) {
        console.log("[lead-digest-dispatch] Already ran in this minute, skipping");
        return new Response(JSON.stringify({ skipped: true, reason: "already_ran" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Compute window boundaries ──
    let windowEnd: Date;
    let windowMode: "scheduled" | "manual_default" | "manual_custom";

    if (triggerType === "manual_custom") {
      // Both force fields required for manual_custom
      if (!forceWindowStart || !forceWindowEnd) {
        return new Response(JSON.stringify({ error: "manual_custom requires force_window_start and force_window_end" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsedStart = new Date(forceWindowStart);
      const parsedEnd = new Date(forceWindowEnd);
      if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
        return new Response(JSON.stringify({ error: "Invalid date format in force_window_start or force_window_end" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (parsedStart >= parsedEnd) {
        return new Response(JSON.stringify({ error: "force_window_start must be before force_window_end" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const diffMs = parsedEnd.getTime() - parsedStart.getTime();
      const maxMs = 31 * 24 * 60 * 60 * 1000; // 31 days
      if (diffMs > maxMs) {
        return new Response(JSON.stringify({ error: "Range too large: maximum 31 days" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      windowEnd = parsedEnd;
      windowMode = "manual_custom";
      // windowStart will be set below
    } else {
      windowEnd = forceWindowEnd ? new Date(forceWindowEnd) : new Date();
      windowMode = triggerType === "scheduled" ? "scheduled" : "manual_default";
    }

    let windowStart: Date;
    if (forceWindowStart) {
      windowStart = new Date(forceWindowStart);
    } else {
      const { data: lastRun } = await supabase
        .from("lead_digest_runs")
        .select("window_end")
        .eq("status", "sent")
        .order("window_end", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastRun?.window_end) {
        // Use window_end of last successful run (not sent_at) to avoid gaps
        windowStart = new Date(lastRun.window_end);
      } else {
        // Fallback: start of current day Europe/Rome
        const tz = config.timezone || "Europe/Rome";
        const todayInTz = new Date().toLocaleDateString("sv-SE", { timeZone: tz });
        windowStart = new Date(`${todayInTz}T00:00:00+01:00`);
      }
    }

    console.log(`[lead-digest-dispatch] Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);

    // ── Query leads in window ──
    // Deduplicate by contact_id, then phone_normalized, then email
    const { data: rawLeads, error: leadsErr } = await supabase
      .from("lead_events")
      .select(`
        id,
        contact_id,
        source_name,
        created_at,
        archived,
        contacts!inner(
          id,
          first_name,
          last_name,
          phone_normalized,
          phone,
          email,
          cap,
          brands!inner(name),
          contact_phones(phone_raw, phone_normalized, is_primary)
        )
      `)
      .gte("created_at", windowStart.toISOString())
      .lte("created_at", windowEnd.toISOString())
      .or("archived.is.null,archived.eq.false")
      .order("created_at", { ascending: false });

    if (leadsErr) {
      console.error("[lead-digest-dispatch] Error fetching leads:", leadsErr);
      // Create a failed run and return error — do not silently send empty digest
      await supabase.from("lead_digest_runs").insert({
        trigger_type: triggerType,
        status: "failed",
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        lead_count_raw: 0,
        lead_count_unique: 0,
        dedupe_stats: null,
        to_recipients: config.to_recipients || [],
        cc_recipients: config.cc_recipients || null,
        include_filtered_link: config.include_filtered_link,
        filtered_link: null,
        payload: {},
        error_message: `DB error fetching leads: ${leadsErr.message}`,
        created_by: userId,
      });
      return new Response(
        JSON.stringify({ success: false, error: `DB error fetching leads: ${leadsErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leads = rawLeads || [];
    const rawCount = leads.length;

    // ── Deduplication ──
    // Priority: contact_id > phone_normalized > email
    // A contact can have multiple lead_events → keep only the most recent one per unique identity
    const seenContactIds = new Set<string>();
    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();
    const dedupedLeads: typeof leads = [];
    let byContact = 0, byPhone = 0, byEmail = 0;

    for (const lead of leads) {
      const contact = lead.contacts as unknown as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        phone_normalized: string | null;
        phone: string | null;
        email: string | null;
        cap: string | null;
        brands: { name: string } | null;
        contact_phones: { phone_raw: string | null; phone_normalized: string | null; is_primary: boolean }[] | null;
      };

      if (!contact) continue;

      const primaryPhone = contact.contact_phones?.find(p => p.is_primary);
      const phoneNorm = primaryPhone?.phone_normalized?.trim() || contact.phone_normalized?.trim() || null;
      const emailLower = contact.email?.trim().toLowerCase() || null;

      const cId = contact.id;
      // Dedup by contact_id first (most reliable)
      if (cId && seenContactIds.has(cId)) {
        byContact++;
        continue;
      }
      // Then dedup by phone (catches contacts without id or with same phone)
      if (phoneNorm && seenPhones.has(phoneNorm)) {
        byPhone++;
        continue;
      }
      // Finally dedup by email
      if (emailLower && seenEmails.has(emailLower)) {
        byEmail++;
        continue;
      }

      if (cId) seenContactIds.add(cId);
      if (phoneNorm) seenPhones.add(phoneNorm);
      if (emailLower) seenEmails.add(emailLower);

      dedupedLeads.push(lead);
    }

    const uniqueCount = dedupedLeads.length;
    const dedupeStats = { raw: rawCount, unique: uniqueCount, deduped_by_contact: byContact, deduped_by_phone: byPhone, deduped_by_email: byEmail };

    // ── Payload size protection ──
    // DIGEST_MAX_LEADS_FULL: above this threshold, switch to summary mode
    // DIGEST_CHUNK_SIZE: max leads per chunk when chunking is needed
    const MAX_LEADS_FULL = 200;
    const CHUNK_SIZE = 100;
    const isSummaryMode = uniqueCount > MAX_LEADS_FULL;

    // ── Build leads array for payload ──
    const mapLead = (lead: typeof dedupedLeads[number]) => {
      const contact = lead.contacts as unknown as {
        first_name: string | null;
        last_name: string | null;
        phone_normalized: string | null;
        phone: string | null;
        email: string | null;
        cap: string | null;
        brands: { name: string } | null;
        contact_phones: { phone_raw: string | null; phone_normalized: string | null; is_primary: boolean }[] | null;
      };
      const primaryPhone = contact.contact_phones?.find(p => p.is_primary);
      const phoneDisplay = primaryPhone?.phone_raw || primaryPhone?.phone_normalized || contact.phone || contact.phone_normalized || null;
      return {
        full_name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null,
        phone: phoneDisplay,
        cap: contact.cap || null,
        brand: contact.brands?.name || null,
        source: lead.source_name || null,
      };
    };

    // In summary mode, only include first CHUNK_SIZE leads in the payload body
    const leadsForBody = isSummaryMode ? dedupedLeads.slice(0, CHUNK_SIZE) : dedupedLeads;
    const leadsPayload = leadsForBody.map(mapLead);
    const allLeadsPayload = dedupedLeads.map(mapLead); // full list for chunked sends if needed

    // ── Filtered link ──
    const appUrl = Deno.env.get("VITE_SUPABASE_URL")?.replace("supabase.co", "lovable.app") || "https://ralph-hub.lovable.app";
    const filteredLink = config.include_filtered_link
      ? `https://ralph-hub.lovable.app/contacts?created_from=${windowStart.toISOString()}&created_to=${windowEnd.toISOString()}`
      : null;

    // ── Determine webhook URL ──
    const webhookUrl = config.webhook_url_override || Deno.env.get("N8N_LEAD_DIGEST_WEBHOOK_URL");
    if (!webhookUrl) {
      return new Response(JSON.stringify({ error: "N8N_LEAD_DIGEST_WEBHOOK_URL not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Validate TO recipients ──
    const toRecipients: string[] = config.to_recipients || [];
    if (toRecipients.length === 0) {
      const errMsg = "to_recipients empty: configure at least one recipient in digest settings";
      console.error("[lead-digest-dispatch]", errMsg);
      // Create a failed run record and return error
      await supabase.from("lead_digest_runs").insert({
        trigger_type: triggerType,
        status: "failed",
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        lead_count_raw: rawCount,
        lead_count_unique: uniqueCount,
        dedupe_stats: dedupeStats,
        to_recipients: [],
        cc_recipients: config.cc_recipients || null,
        include_filtered_link: config.include_filtered_link,
        filtered_link: filteredLink,
        payload: {},
        error_message: errMsg,
        created_by: userId,
      });
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    // ── Build subject ──
    const tz = config.timezone || "Europe/Rome";
    const windowEndLocal = new Date(windowEnd).toLocaleString("it-IT", {
      timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    const subject = `Aggiornamento Lead (${uniqueCount}) - ${windowEndLocal}`;

    // ── HTML escaping helper ──
    const esc = (s: string | null | undefined): string => {
      if (!s) return "—";
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };

    // ── Build HTML body ──
    const fmtLocal = (iso: string) =>
      new Date(iso).toLocaleString("it-IT", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

    const leadsTableRows = leadsPayload.map((l) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.full_name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.phone)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.cap)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.brand)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.source)}</td>
      </tr>`).join("");

    // Summary mode notice
    const summaryNotice = isSummaryMode
      ? `<p style="background:#fff3cd;padding:10px;border-radius:6px;border:1px solid #ffc107;margin:10px 0;">
           ⚠️ <strong>Modalità riepilogo:</strong> ${uniqueCount} lead totali, mostrati i primi ${leadsPayload.length}.
           ${filteredLink ? `<a href="${filteredLink}">Vedi tutti nel CRM →</a>` : "Usa il link CRM per la lista completa."}
         </p>`
      : "";

    const leadsTableHtml = leadsPayload.length > 0 ? `
      ${summaryNotice}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ddd;">Nome</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ddd;">Telefono</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ddd;">CAP</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ddd;">Brand</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ddd;">Fonte</th>
          </tr>
        </thead>
        <tbody>${leadsTableRows}</tbody>
      </table>` : `<p style="color:#888;font-style:italic;">Nessun lead nel periodo.</p>`;

    const filteredLinkHtml = filteredLink
      ? `<p style="margin-top:20px;"><a href="${filteredLink}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Vedi lead filtrati nel CRM</a></p>`
      : "";

    const html_body = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#222;max-width:700px;margin:0 auto;padding:20px;">
  <h2 style="margin-top:0;color:#1e3a5f;">📋 Aggiornamento Lead</h2>
  <p><strong>Periodo:</strong> ${fmtLocal(windowStart.toISOString())} → ${fmtLocal(windowEnd.toISOString())}</p>
  <p><strong>Lead unici nuovi:</strong> <span style="font-size:18px;font-weight:bold;color:#2563eb;">${uniqueCount}</span>
    <span style="color:#888;font-size:12px;">(grezzo: ${rawCount})</span></p>
  ${leadsTableHtml}
  ${filteredLinkHtml}
  <hr style="margin-top:30px;border:none;border-top:1px solid #eee;">
  <p style="font-size:11px;color:#aaa;">Inviato automaticamente da CRM Ralph Hub · ${new Date().toISOString()}</p>
</body>
</html>`;

    const textLeadsList = leadsPayload.map((l, i) =>
      `${i + 1}. ${l.full_name || "—"} | ${l.phone || "—"} | ${l.cap || "—"} | ${l.brand || "—"} | ${l.source || "—"}`
    ).join("\n");

    const summaryTextNotice = isSummaryMode
      ? `\n⚠️ Modalità riepilogo: ${uniqueCount} lead totali, mostrati i primi ${leadsPayload.length}. Usa il CRM per la lista completa.\n`
      : "";

    const text_body = `Aggiornamento Lead
Periodo: ${fmtLocal(windowStart.toISOString())} → ${fmtLocal(windowEnd.toISOString())}
Lead unici nuovi: ${uniqueCount} (grezzo: ${rawCount})
${summaryTextNotice}
${leadsPayload.length > 0 ? textLeadsList : "Nessun lead nel periodo."}
${filteredLink ? `\nVedi lead filtrati: ${filteredLink}` : ""}

---
Inviato automaticamente da CRM Ralph Hub`;

    // ── Build payload ──
    // In summary mode, the leads array in payload is truncated to avoid oversized webhook calls
    const now = new Date();
    const payload = {
      event_type: "lead_digest_callcenter",
      generated_at: now.toISOString(),
      timezone: config.timezone || "Europe/Rome",
      window_mode: windowMode,
      digest_mode: isSummaryMode ? "summary" : "full",
      total_leads: uniqueCount,
      leads_included: leadsPayload.length,
      window: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
      },
      recipients: {
        to: toRecipients,
        cc: config.cc_recipients || [],
      },
      counts: {
        raw_leads: rawCount,
        unique_real_leads: uniqueCount,
      },
      include_filtered_link: config.include_filtered_link,
      filtered_link: filteredLink,
      subject,
      html_body,
      text_body,
      leads: leadsPayload,
    };

    // ── Create pending run record ──
    const { data: runRecord, error: runInsertErr } = await supabase
      .from("lead_digest_runs")
      .insert({
        trigger_type: triggerType,
        status: "pending",
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        lead_count_raw: rawCount,
        lead_count_unique: uniqueCount,
        dedupe_stats: dedupeStats,
        to_recipients: config.to_recipients || [],
        cc_recipients: config.cc_recipients || null,
        include_filtered_link: config.include_filtered_link,
        filtered_link: filteredLink,
        payload,
        created_by: userId,
      })
      .select("id")
      .single();

    if (runInsertErr) {
      console.error("[lead-digest-dispatch] Failed to create run record:", runInsertErr);
    }

    const runId = runRecord?.id;

    // ── Send to n8n ──
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;
    let sent = false;

    try {
      const n8nResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
      responseStatus = n8nResponse.status;
      responseBody = (await n8nResponse.text()).substring(0, 2000);
      sent = n8nResponse.ok;
      if (!sent) errorMessage = `n8n returned ${responseStatus}: ${responseBody.substring(0, 200)}`;
    } catch (fetchErr) {
      errorMessage = fetchErr instanceof Error ? fetchErr.message : "Fetch error";
      console.error("[lead-digest-dispatch] Fetch error:", fetchErr);
    }

    // ── Update run record ──
    const nowIso = new Date().toISOString();
    const retryAt = sent ? null : new Date(Date.now() + 10 * 60 * 1000).toISOString();

    if (runId) {
      await supabase.from("lead_digest_runs").update({
        status: sent ? "sent" : "failed",
        response_status: responseStatus,
        response_body: responseBody,
        error_message: errorMessage,
        sent_at: sent ? nowIso : null,
        scheduled_for_retry_at: retryAt,
      }).eq("id", runId);
    }

    console.log(`[lead-digest-dispatch] ${triggerType} run ${sent ? "sent" : "failed"} — ${uniqueCount} unique leads`);

    return new Response(
      JSON.stringify({
        success: sent,
        trigger_type: triggerType,
        run_id: runId,
        window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
        counts: { raw: rawCount, unique: uniqueCount },
        error: errorMessage,
        retry_at: retryAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error("[lead-digest-dispatch] Unhandled error:", errMsg);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
