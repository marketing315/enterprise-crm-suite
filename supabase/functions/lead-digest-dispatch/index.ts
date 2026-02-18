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
    // ── Auth: cron secret OR service JWT OR admin/ceo user JWT ──
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
    const authHeader = req.headers.get("Authorization");

    const isCronCall =
      cronSecret &&
      (cronSecret === expectedSecret || cronSecret === cronSecretPrev);

    let isServiceCall = false;
    let isAdminCall = false;
    let userId: string | null = null;
    let triggerType: string = "scheduled";

    if (!isCronCall && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const verifyClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData } = await verifyClient.auth.getClaims(token);
      if (claimsData?.claims?.role === "service_role") {
        isServiceCall = true;
      } else {
        // Check user is admin/ceo
        const { data: userData } = await verifyClient.auth.getUser(token);
        if (!userData?.user) {
          return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: internalUser } = await supabase
          .from("users")
          .select("id")
          .eq("supabase_auth_id", userData.user.id)
          .maybeSingle();

        if (!internalUser?.id) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = internalUser.id;

        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        if (!roles?.some((r) => r.role === "admin" || r.role === "ceo")) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        isAdminCall = true;
        triggerType = "manual";
      }
    }

    if (!isCronCall && !isServiceCall && !isAdminCall) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch { /* no body */ }

    const forceWindowStart: string | null = (body.force_window_start as string) || null;
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
      const nowInTz = new Date().toLocaleString("en-US", { timeZone: tz, hour12: false });
      const [, timePart] = nowInTz.split(", ");
      const [h, m] = timePart.split(":").map(Number);
      const currentHHMM = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

      const slots: string[] = config.schedule_times || ["12:00", "16:30"];
      const isInSlot = slots.some((slot: string) => {
        const [sh, sm] = slot.split(":").map(Number);
        // Match within same minute window
        return h === sh && m === sm;
      });

      if (!isInSlot) {
        console.log(`[lead-digest-dispatch] Not a send slot (${currentHHMM}), skipping`);
        return new Response(JSON.stringify({ skipped: true, reason: "not_in_slot", current_time: currentHHMM }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Anti-duplicate: check if already sent within this minute
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: recentRun } = await supabase
        .from("lead_digest_runs")
        .select("id, created_at")
        .in("status", ["sent", "pending"])
        .eq("trigger_type", "scheduled")
        .gte("created_at", oneMinuteAgo)
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

    const windowEnd = new Date();

    // ── Compute window_start: last successful sent_at ──
    let windowStart: Date;
    if (forceWindowStart) {
      windowStart = new Date(forceWindowStart);
    } else {
      const { data: lastRun } = await supabase
        .from("lead_digest_runs")
        .select("sent_at, window_end")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastRun?.sent_at) {
        windowStart = new Date(lastRun.sent_at);
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
          email,
          brands!inner(name)
        )
      `)
      .gte("created_at", windowStart.toISOString())
      .lte("created_at", windowEnd.toISOString())
      .or("archived.is.null,archived.eq.false")
      .order("created_at", { ascending: false });

    if (leadsErr) {
      console.error("[lead-digest-dispatch] Error fetching leads:", leadsErr);
    }

    const leads = rawLeads || [];
    const rawCount = leads.length;

    // ── Deduplication ──
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
        email: string | null;
        brands: { name: string } | null;
      };

      if (!contact) continue;

      const contactId = contact.id;
      const phoneNorm = contact.phone_normalized?.trim() || null;
      const emailLower = contact.email?.trim().toLowerCase() || null;

      if (contactId && seenContactIds.has(contactId)) {
        byContact++;
        continue;
      }
      if (!contactId && phoneNorm && seenPhones.has(phoneNorm)) {
        byPhone++;
        continue;
      }
      if (!contactId && !phoneNorm && emailLower && seenEmails.has(emailLower)) {
        byEmail++;
        continue;
      }

      if (contactId) seenContactIds.add(contactId);
      if (phoneNorm) seenPhones.add(phoneNorm);
      if (emailLower) seenEmails.add(emailLower);

      dedupedLeads.push(lead);
    }

    const uniqueCount = dedupedLeads.length;
    const dedupeStats = { raw: rawCount, unique: uniqueCount, deduped_by_contact: byContact, deduped_by_phone: byPhone, deduped_by_email: byEmail };

    // ── Build leads array for payload ──
    const leadsPayload = dedupedLeads.map((lead) => {
      const contact = lead.contacts as unknown as {
        first_name: string | null;
        last_name: string | null;
        phone_normalized: string | null;
        email: string | null;
        brands: { name: string } | null;
      };
      return {
        full_name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null,
        phone: contact.phone_normalized || null,
        email: contact.email || null,
        source: lead.source_name || null,
        brand: contact.brands?.name || null,
        created_at: lead.created_at,
      };
    });

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

    // ── Build payload ──
    const now = new Date();
    const payload = {
      event_type: "lead_digest_callcenter",
      generated_at: now.toISOString(),
      timezone: config.timezone || "Europe/Rome",
      window: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
      },
      recipients: {
        to: config.to_recipients || [],
        cc: config.cc_recipients || [],
      },
      counts: {
        raw_leads: rawCount,
        unique_real_leads: uniqueCount,
      },
      include_filtered_link: config.include_filtered_link,
      filtered_link: filteredLink,
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
    console.error("[lead-digest-dispatch] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
