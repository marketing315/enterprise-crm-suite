// sales-route-preview: render HTML preview of the route email for a given
// brand/user/date BEFORE sending. Used by /appointments/calendar UI.
// Auth: requires authenticated user with admin/ceo/responsabile_venditori
// (or the user themselves for individual mode).

import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { createClient } from "npm:@supabase/supabase-js@2";
import { TEMPLATES } from "../_shared/transactional-email-templates/registry.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function buildMapsUrl(items: any[]): string | null {
  const stops = items.map((a: any) => {
    const ad = a.address || a?.contact?.address;
    const city = a.city || a?.contact?.city;
    const cap = a.cap || a?.contact?.cap;
    return [ad, [cap, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  }).filter(Boolean);
  if (!stops.length) return null;
  const dest = encodeURIComponent(stops[stops.length - 1]);
  const wp = stops.slice(0, -1).map(encodeURIComponent).join("|");
  const base = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${dest}`;
  return wp ? `${base}&waypoints=${wp}` : base;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const mode = body.mode || "individual"; // individual | aggregate
  const brandId = body.brand_id;
  const date = body.route_date;
  const userId = body.user_id;
  if (!brandId || !date) {
    return new Response(JSON.stringify({ error: "brand_id and route_date required" }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: brand } = await supabase.from("brands").select("name").eq("id", brandId).maybeSingle();

  try {
    if (mode === "individual") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "user_id required for individual mode" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Use user's JWT so RPC enforces RBAC
      const { data: route, error } = await userClient.rpc("get_sales_route_for_user", {
        p_brand_id: brandId, p_user_id: userId, p_date: date,
      });
      if (error) throw error;
      const apts = route?.appointments || [];
      const t = TEMPLATES["sales-route-individual"];
      const html = await renderAsync(React.createElement(t.component, {
        sellerName: route?.user?.full_name,
        routeDate: date, brandName: brand?.name ?? null,
        appointments: apts, mapsUrl: buildMapsUrl(apts),
      }));
      const subject = typeof t.subject === "function" ? t.subject({ appointments: apts }) : t.subject;
      return new Response(JSON.stringify({ html, subject, count: apts.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      const { data: agg, error } = await userClient.rpc("get_sales_route_aggregate", {
        p_brand_id: brandId, p_date: date,
      });
      if (error) throw error;
      const t = TEMPLATES["sales-route-aggregate"];
      const html = await renderAsync(React.createElement(t.component, {
        brandName: brand?.name ?? null, routeDate: date,
        groups: agg?.groups || [], totalAppointments: agg?.total_appointments || 0,
      }));
      const subject = typeof t.subject === "function"
        ? t.subject({ totalAppointments: agg?.total_appointments || 0 }) : t.subject;
      return new Response(JSON.stringify({
        html, subject, count: agg?.total_appointments || 0, sellers: agg?.sellers_count || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
