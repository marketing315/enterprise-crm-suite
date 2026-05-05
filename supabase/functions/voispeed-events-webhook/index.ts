import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual as sharedTimingSafeEqual } from "../_shared/crypto.ts";

/**
 * VOIspeed v4 Events Webhook
 * 
 * This endpoint receives events from VOIspeed via querystring parameters.
 * Events include: incoming_call, outgoing_call, call_answered, 
 * call_disconnect_in, call_disconnect_out, lost_call, cmd_failed
 * 
 * Security: validates the token parameter against VOISPEED_WEBHOOK_TOKEN secret.
 */

interface VOIspeedEvent {
  event_name: string;
  ext: string;
  number: string;
  usercallid?: string;
  datetime?: string;
  extid?: string;
  token?: string;
  duration?: string;
  request_id?: string;
  error_code?: string;
  error_msg?: string;
}

// Normalize phone number: strip non-digits and country code prefix
// to match CRM contact_phones.phone_normalized format (e.g. "3331234567")
function normalizePhoneNumber(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0039")) {
    digits = digits.substring(4);
  } else if (digits.startsWith("39") && digits.length > 10) {
    digits = digits.substring(2);
  }
  return digits;
}

// Constant-time string comparison (re-exported from _shared/crypto.ts)
function timingSafeEqual(a: string, b: string): boolean {
  return sharedTimingSafeEqual(a, b);
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  // VOIspeed sends events as GET with querystring
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries()) as unknown as VOIspeedEvent;

  try {
    // --- Authentication: validate shared secret token ---
    const expectedToken = Deno.env.get("VOISPEED_WEBHOOK_TOKEN");
    if (!expectedToken) {
      console.error("[VOIspeed] VOISPEED_WEBHOOK_TOKEN not configured");
      return new Response("Server misconfigured", { status: 500 });
    }

    const providedToken = params.token || "";
    if (!providedToken || !timingSafeEqual(providedToken, expectedToken)) {
      console.warn("[VOIspeed] Unauthorized request - invalid or missing token");
      return new Response("Unauthorized", { status: 401 });
    }

    // --- C8: optional HMAC + timestamp anti-replay (opt-in via VOISPEED_HMAC_SECRET) ---
    const hmacSecret = Deno.env.get("VOISPEED_HMAC_SECRET");
    if (hmacSecret) {
      const sigHeader = req.headers.get("x-voispeed-signature") ?? "";
      const tsHeader = req.headers.get("x-voispeed-timestamp") ?? "";
      const ts = Number(tsHeader);
      if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
        console.warn("[VOIspeed] HMAC ts skew or missing");
        return new Response("Unauthorized", { status: 401 });
      }
      const expectedSig = await hmacSha256Hex(hmacSecret, `${ts}.${url.search}`);
      if (!sigHeader || !timingSafeEqual(sigHeader, expectedSig)) {
        console.warn("[VOIspeed] HMAC signature mismatch");
        return new Response("Unauthorized", { status: 401 });
      }
    }


    // --- Validated, proceed with event processing ---
    console.log("[VOIspeed] Event received:", { event_name: params.event_name, ext: params.ext });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { event_name, ext, number, usercallid, datetime, extid, duration } = params;

    if (!event_name) {
      return new Response("Missing event_name", { status: 400 });
    }

    const normalizedNumber = normalizePhoneNumber(number || "");
    const eventTime = datetime ? new Date(datetime).toISOString() : new Date().toISOString();

    // Find user by VOIspeed extension
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, brand_id:user_roles(brand_id)")
      .eq("voispeed_ext", ext)
      .maybeSingle();

    if (userError) {
      console.error("[VOIspeed] Failed to find user by ext:", { ext, error: userError.message });
    }

    // Find contact by phone number
    const { data: contactPhone, error: phoneError } = await supabase
      .from("contact_phones")
      .select("contact_id, brand_id")
      .eq("phone_normalized", normalizedNumber)
      .eq("is_active", true)
      .maybeSingle();

    if (phoneError) {
      console.error("[VOIspeed] Failed to find contact phone:", { phone: `***${(normalizedNumber||"").slice(-4)}`, error: phoneError.message });
    }

    if (!contactPhone) {
      console.warn("[VOIspeed] No contact found for phone:", { phone: `***${(normalizedNumber||"").slice(-4)}`, event: event_name });
    }

    // Get brand_id from contact or user
    let brandId: string | null = contactPhone?.brand_id || null;
    if (!brandId && user?.brand_id && Array.isArray(user.brand_id) && user.brand_id.length > 0) {
      brandId = (user.brand_id[0] as { brand_id: string }).brand_id;
    }

    // Event handling based on event type
    switch (event_name) {
      case "incoming_call": {
        // Create call log for inbound call
        if (brandId && user?.id) {
          const { data: callLog, error: callLogError } = await supabase
            .from("call_logs")
            .insert({
              brand_id: brandId,
              contact_id: contactPhone?.contact_id || null,
              user_id: user.id,
              phone_number: normalizedNumber,
              call_type: "inbound",
              status: "ringing",
              provider: "voispeed",
              provider_call_id: usercallid,
              started_at: eventTime,
            })
            .select("id")
            .single();

          if (callLogError) {
            console.error("[VOIspeed] Failed to insert call_log (incoming):", { error: callLogError.message, ext, phone: `***${(normalizedNumber||"").slice(-4)}` });
            break;
          }

          // Create incoming_call notification for screen-pop
          if (callLog) {
            // Find open deal for contact
            let dealId: string | null = null;
            if (contactPhone?.contact_id) {
              const { data: deal, error: dealError } = await supabase
                .from("deals")
                .select("id")
                .eq("contact_id", contactPhone.contact_id)
                .eq("brand_id", brandId)
                .eq("status", "open")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (dealError) {
                console.error("[VOIspeed] Failed to find deal:", { contact_id: contactPhone.contact_id, error: dealError.message });
              }
              dealId = deal?.id || null;
            }

            const { error: incomingError } = await supabase
              .from("incoming_calls")
              .insert({
                brand_id: brandId,
                user_id: user.id,
                contact_id: contactPhone?.contact_id || null,
                deal_id: dealId,
                call_log_id: callLog.id,
                phone_number: normalizedNumber,
                voispeed_ext: ext,
                provider_call_id: usercallid,
                status: "ringing",
              });

            if (incomingError) {
              console.error("[VOIspeed] Failed to insert incoming_call:", { error: incomingError.message, call_log_id: callLog.id });
            } else {
              console.log(`[VOIspeed] Screen-pop notification created for user ${user.id}`);
            }
          }
        }
        break;
      }

      case "outgoing_call": {
        // If we have extid, link to existing call_log
        if (extid) {
          const { error: updateError } = await supabase
            .from("call_logs")
            .update({
              provider_call_id: usercallid,
              status: "ringing",
            })
            .eq("provider_ext_id", extid);

          if (updateError) {
            console.error("[VOIspeed] Failed to update call_log (outgoing extid):", { extid, error: updateError.message });
          } else {
            console.log(`[VOIspeed] Outgoing call linked via extid: ${extid}`);
          }
        } else if (brandId && user?.id) {
          // Create new call log if no extid (manual dial from phone)
          const { error: insertError } = await supabase
            .from("call_logs")
            .insert({
              brand_id: brandId,
              contact_id: contactPhone?.contact_id || null,
              user_id: user.id,
              phone_number: normalizedNumber,
              call_type: "outbound",
              status: "ringing",
              provider: "voispeed",
              provider_call_id: usercallid,
              started_at: eventTime,
            });

          if (insertError) {
            console.error("[VOIspeed] Failed to insert call_log (outgoing manual):", { error: insertError.message, ext, phone: `***${(normalizedNumber||"").slice(-4)}` });
          }
        }
        break;
      }

      case "call_answered": {
        // Update call log to answered
        if (usercallid) {
          const { error: callUpdateError } = await supabase
            .from("call_logs")
            .update({ status: "answered" })
            .eq("provider_call_id", usercallid);

          if (callUpdateError) {
            console.error("[VOIspeed] Failed to update call_log (answered):", { usercallid, error: callUpdateError.message });
          }

          // Update incoming_call notification
          const { error: incomingUpdateError } = await supabase
            .from("incoming_calls")
            .update({ status: "answered" })
            .eq("provider_call_id", usercallid);

          if (incomingUpdateError) {
            console.error("[VOIspeed] Failed to update incoming_call (answered):", { usercallid, error: incomingUpdateError.message });
          }
        }
        break;
      }

      case "call_disconnect_in":
      case "call_disconnect_out": {
        // Call completed
        if (usercallid) {
          const durationSeconds = duration ? parseInt(duration, 10) : null;
          
          const { error: callUpdateError } = await supabase
            .from("call_logs")
            .update({
              status: "completed",
              ended_at: eventTime,
              duration_seconds: durationSeconds,
            })
            .eq("provider_call_id", usercallid);

          if (callUpdateError) {
            console.error("[VOIspeed] Failed to update call_log (disconnect):", { usercallid, error: callUpdateError.message });
          }

          // Mark incoming_call as dismissed
          const { error: incomingUpdateError } = await supabase
            .from("incoming_calls")
            .update({ 
              status: "dismissed",
              dismissed_at: eventTime,
            })
            .eq("provider_call_id", usercallid);

          if (incomingUpdateError) {
            console.error("[VOIspeed] Failed to update incoming_call (dismissed):", { usercallid, error: incomingUpdateError.message });
          }
        }
        break;
      }

      case "lost_call": {
        // Missed call
        if (usercallid) {
          const { error: callUpdateError } = await supabase
            .from("call_logs")
            .update({
              status: "no_answer",
              ended_at: eventTime,
            })
            .eq("provider_call_id", usercallid);

          if (callUpdateError) {
            console.error("[VOIspeed] Failed to update call_log (lost):", { usercallid, error: callUpdateError.message });
          }

          const { error: incomingUpdateError } = await supabase
            .from("incoming_calls")
            .update({ status: "missed" })
            .eq("provider_call_id", usercallid);

          if (incomingUpdateError) {
            console.error("[VOIspeed] Failed to update incoming_call (missed):", { usercallid, error: incomingUpdateError.message });
          }
        } else if (brandId && user?.id) {
          // Create missed call log
          const { error: insertError } = await supabase
            .from("call_logs")
            .insert({
              brand_id: brandId,
              contact_id: contactPhone?.contact_id || null,
              user_id: user.id,
              phone_number: normalizedNumber,
              call_type: "inbound",
              status: "no_answer",
              provider: "voispeed",
              started_at: eventTime,
              ended_at: eventTime,
            });

          if (insertError) {
            console.error("[VOIspeed] Failed to insert call_log (lost, no usercallid):", { error: insertError.message, ext, phone: `***${(normalizedNumber||"").slice(-4)}` });
          }
        }
        break;
      }

      case "cmd_failed": {
        // Command failed (e.g., call_request failed)
        const errorMsg = params.error_msg || params.error_code || "Unknown error";
        
        if (extid) {
          const { error: updateError } = await supabase
            .from("call_logs")
            .update({
              status: "failed",
              last_error: errorMsg,
              ended_at: eventTime,
            })
            .eq("provider_ext_id", extid);

          if (updateError) {
            console.error("[VOIspeed] Failed to update call_log (cmd_failed):", { extid, error: updateError.message });
          }
        }
        console.error(`[VOIspeed] cmd_failed: ${errorMsg}`, { ext, extid, usercallid });
        break;
      }

      default:
        console.log(`[VOIspeed] Unhandled event: ${event_name}`);
    }

    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error("[VOIspeed] Unhandled webhook error:", error);
    return new Response("Internal error", { status: 500 });
  }
});
