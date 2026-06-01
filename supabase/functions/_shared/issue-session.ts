// _shared/issue-session.ts
// Helper unico per emettere una sessione Supabase server-side a partire
// dall'email di un utente esistente, riusato da:
//   - passkey-auth-verify  (post verifica firma WebAuthn)
//   - biometric-pin-login  (post token PIN one-shot)
//
// Pattern: admin.generateLink({type:'magiclink'}) → properties.hashed_token
// poi anonClient.auth.verifyOtp({token_hash, type:'magiclink'}) → sessione.
//
// Non emette OTP via email: il link non viene mai inviato, lo consumiamo
// inline server-side. È un workaround necessario finché Supabase non espone
// un'API admin per emettere direttamente access_token + refresh_token.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface IssuedSession {
  access_token: string;
  refresh_token: string;
  expires_at: number | null | undefined;
}

export interface IssueSessionResult {
  ok: true;
  session: IssuedSession;
}

export interface IssueSessionError {
  ok: false;
  reason: "generate_link_failed" | "verify_otp_failed";
  detail?: string;
}

/**
 * @param admin   service-role client (per generateLink)
 * @param email   email dell'utente target (deve esistere su auth.users)
 */
export async function issueSessionForEmail(
  admin: SupabaseClient,
  email: string,
): Promise<IssueSessionResult | IssueSessionError> {
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return {
      ok: false,
      reason: "generate_link_failed",
      detail: linkErr?.message,
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyErr || !verifyData?.session) {
    return {
      ok: false,
      reason: "verify_otp_failed",
      detail: verifyErr?.message,
    };
  }

  return {
    ok: true,
    session: {
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
      expires_at: verifyData.session.expires_at,
    },
  };
}
