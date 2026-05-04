// Public endpoint that returns the VAPID public key for the client.
// Public key is, by definition, public — no auth required.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const key = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  return new Response(JSON.stringify({ publicKey: key }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
