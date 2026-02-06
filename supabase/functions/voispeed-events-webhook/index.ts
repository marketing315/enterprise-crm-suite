import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * VOIspeed v4 Events Webhook
 * 
 * This endpoint receives events from VOIspeed via querystring parameters.
 * Events include: incoming_call, outgoing_call, call_answered, 
 * call_disconnect_in, call_disconnect_out, lost_call, cmd_failed
 * 
 * For security, validate the token parameter matches our config.
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

// Normalize phone number to E.164-like format (strip non-digits, ensure country code)
function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // If starts with 0039 or 39, convert to +39
  if (digits.startsWith("0039")) {
    return "+" + digits.substring(2);
  }
  if (digits.startsWith("39") && digits.length > 10) {
    return "+" + digits;
  }
  // If Italian mobile/landline without country code
  if (digits.startsWith("3") && digits.length === 10) {
    return "+39" + digits;
  }
  if (digits.startsWith("0") && digits.length >= 9) {
    return "+39" + digits;
  }
  return digits;
}

serve(async (req: Request) => {
  // VOIspeed sends events as GET with querystring
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries()) as unknown as VOIspeedEvent;
  
  console.log("VOIspeed event received:", params);

  try {
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
    const { data: user } = await supabase
      .from("users")
      .select("id, brand_id:user_roles(brand_id)")
      .eq("voispeed_ext", ext)
      .maybeSingle();

    // Find contact by phone number
    const { data: contactPhone } = await supabase
      .from("contact_phones")
      .select("contact_id, brand_id")
      .eq("phone_normalized", normalizedNumber)
      .eq("is_active", true)
      .maybeSingle();

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
          const { data: callLog } = await supabase
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

          // Create incoming_call notification for screen-pop
          if (callLog) {
            // Find open deal for contact
            let dealId: string | null = null;
            if (contactPhone?.contact_id) {
              const { data: deal } = await supabase
                .from("deals")
                .select("id")
                .eq("contact_id", contactPhone.contact_id)
                .eq("brand_id", brandId)
                .eq("status", "open")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              dealId = deal?.id || null;
            }

            await supabase
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

            console.log(`Screen-pop notification created for user ${user.id}`);
          }
        }
        break;
      }

      case "outgoing_call": {
        // If we have extid, link to existing call_log
        if (extid) {
          await supabase
            .from("call_logs")
            .update({
              provider_call_id: usercallid,
              status: "ringing",
            })
            .eq("provider_ext_id", extid);
          console.log(`Outgoing call linked via extid: ${extid}`);
        } else if (brandId && user?.id) {
          // Create new call log if no extid (manual dial from phone)
          await supabase
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
        }
        break;
      }

      case "call_answered": {
        // Update call log to answered
        if (usercallid) {
          await supabase
            .from("call_logs")
            .update({ status: "answered" })
            .eq("provider_call_id", usercallid);

          // Update incoming_call notification
          await supabase
            .from("incoming_calls")
            .update({ status: "answered" })
            .eq("provider_call_id", usercallid);
        }
        break;
      }

      case "call_disconnect_in":
      case "call_disconnect_out": {
        // Call completed
        if (usercallid) {
          const durationSeconds = duration ? parseInt(duration, 10) : null;
          
          await supabase
            .from("call_logs")
            .update({
              status: "completed",
              ended_at: eventTime,
              duration_seconds: durationSeconds,
            })
            .eq("provider_call_id", usercallid);

          // Mark incoming_call as dismissed
          await supabase
            .from("incoming_calls")
            .update({ 
              status: "dismissed",
              dismissed_at: eventTime,
            })
            .eq("provider_call_id", usercallid);
        }
        break;
      }

      case "lost_call": {
        // Missed call
        if (usercallid) {
          await supabase
            .from("call_logs")
            .update({
              status: "no_answer",
              ended_at: eventTime,
            })
            .eq("provider_call_id", usercallid);

          await supabase
            .from("incoming_calls")
            .update({ status: "missed" })
            .eq("provider_call_id", usercallid);
        } else if (brandId && user?.id) {
          // Create missed call log
          await supabase
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
        }
        break;
      }

      case "cmd_failed": {
        // Command failed (e.g., call_request failed)
        const errorMsg = params.error_msg || params.error_code || "Unknown error";
        
        if (extid) {
          await supabase
            .from("call_logs")
            .update({
              status: "failed",
              last_error: errorMsg,
              ended_at: eventTime,
            })
            .eq("provider_ext_id", extid);
        }
        console.error(`VOIspeed cmd_failed: ${errorMsg}`);
        break;
      }

      default:
        console.log(`Unhandled VOIspeed event: ${event_name}`);
    }

    // VOIspeed expects 200 OK
    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error("VOIspeed webhook error:", error);
    // Still return 200 to prevent VOIspeed retries
    return new Response("Error logged", { status: 200 });
  }
});
