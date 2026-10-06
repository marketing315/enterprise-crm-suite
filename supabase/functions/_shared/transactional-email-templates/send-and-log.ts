// deno-lint-ignore-file no-explicit-any
// Wraps sendTemplateEmail and keeps the project's email_send_log history
// (sent / suppressed / failed) that the legacy queue used to write.
// Some features (e.g. lockout dedup) read these rows.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail, type SendTemplateEmailOptions, type SendTemplateEmailResult } from './send-email.ts'

let _admin: any = null
function admin() {
  if (_admin) return _admin
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  _admin = createClient(url, key)
  return _admin
}

async function logRow(row: Record<string, unknown>) {
  const sb = admin()
  if (!sb) return
  const { error } = await sb.from('email_send_log').insert(row)
  if (error) console.error('[email-log] insert failed', { code: error.code, message: error.message })
}

export async function sendTemplateEmailLogged(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {},
): Promise<SendTemplateEmailResult> {
  const base = { message_id: crypto.randomUUID(), template_name: templateName, recipient_email: to }
  try {
    const res = await sendTemplateEmail(templateName, to, options)
    await logRow({ ...base, status: res.sent ? 'sent' : 'suppressed' })
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logRow({ ...base, status: 'failed', error_message: msg.slice(0, 1000) })
    throw e
  }
}
