// A2 Vault: helper to resolve Meta access tokens via SECURITY DEFINER RPC.
// The DB function falls back to the legacy plaintext column automatically,
// so callers don't need to know whether the secret has been migrated yet.
//
// Usage:
//   import { getMetaAppAccessToken } from "../_shared/meta-secrets.ts";
//   const token = await getMetaAppAccessToken(supabase, metaApp.id);
//   if (!token) throw new Error("meta_app_token_missing");
//
// `supabase` MUST be a service_role client (only role allowed to EXECUTE).

// deno-lint-ignore no-explicit-any
type Client = any;

export async function getMetaAppAccessToken(
  supabase: Client,
  metaAppId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("meta_apps_get_access_token", { p_id: metaAppId });
  if (error) {
    console.error("[meta-secrets] meta_apps_get_access_token error:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

export async function putMetaAppAccessToken(
  supabase: Client,
  metaAppId: string,
  value: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("meta_apps_put_access_token", {
    p_id: metaAppId,
    p_value: value ?? "",
  });
  if (error) throw new Error(`meta_apps_put_access_token: ${error.message}`);
}

export async function getMetaLeadSourceAccessToken(
  supabase: Client,
  sourceId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("meta_lead_sources_get_access_token", { p_id: sourceId });
  if (error) {
    console.error("[meta-secrets] meta_lead_sources_get_access_token error:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

export async function putMetaLeadSourceAccessToken(
  supabase: Client,
  sourceId: string,
  value: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("meta_lead_sources_put_access_token", {
    p_id: sourceId,
    p_value: value ?? "",
  });
  if (error) throw new Error(`meta_lead_sources_put_access_token: ${error.message}`);
}

export async function resolveMetaPageAccessToken(
  accessToken: string,
  pageId: string | null | undefined,
): Promise<string> {
  if (!pageId) return accessToken;

  try {
    const { metaGraphUrl } = await import("./meta-graph.ts");
    const url = new URL(metaGraphUrl(`/${pageId}`));
    url.searchParams.set("fields", "access_token");
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url.toString());
    const data = await res.json() as { access_token?: string; error?: { message?: string; code?: number } };
    if (res.ok && data.access_token) return data.access_token;

    console.warn("[meta-secrets] could not resolve page token; falling back to stored token", {
      page_id: pageId,
      status: res.status,
      code: data.error?.code,
      message: data.error?.message,
    });
  } catch (err) {
    console.warn("[meta-secrets] page token resolution failed; falling back to stored token", {
      page_id: pageId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return accessToken;
}
