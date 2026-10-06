import { sendTemplateEmailLogged } from './transactional-email-templates/send-and-log.ts'
// Sends an HTML email per active recipient configured for (meta_app, form_id).
// Never throws: lead ingestion must not depend on email delivery.
// deno-lint-ignore-file no-explicit-any
const CRM_BASE = "https://crm.gruppobenessere.it";

function prettyLabel(name: string): string {
  const s = name.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function notifyMetaLeadByEmail(
  supabase: any,
  args: {
    metaAppId: string;
    formId: string | null | undefined;
    leadgenId: string;
    brandId: string;
    contactId?: string | null;
    leadData: any;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
    city?: string | null;
    idempotencySuffix?: string;
  },
): Promise<void> {
  try {
    if (!args.formId) return;
    const { data: recips, error } = await supabase
      .from("meta_form_email_recipients")
      .select("recipient_email, form_name")
      .eq("meta_app_id", args.metaAppId)
      .eq("form_id", args.formId)
      .eq("is_active", true);
    if (error || !recips?.length) return;

    const { data: brand } = await supabase.from("brands").select("name").eq("id", args.brandId).maybeSingle();
    const fd: Array<{ name: string; values?: string[] }> = args.leadData?.field_data ?? [];
    const fields = fd.map((f) => ({ label: prettyLabel(f.name), value: (f.values ?? []).join(", ") }));
    const created = args.leadData?.created_time ? new Date(args.leadData.created_time) : new Date();

    const templateData = {
      fullName: [args.firstName, args.lastName].filter(Boolean).join(" ") || undefined,
      phone: args.phone || undefined,
      email: args.email || undefined,
      city: args.city || undefined,
      formName: recips[0].form_name || args.leadData?.form_name || undefined,
      campaignName: args.leadData?.campaign_name || undefined,
      brandName: brand?.name || undefined,
      receivedAt: created.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }),
      fields,
      crmUrl: `${CRM_BASE}/events`,
    };

    for (const r of recips) {
      try {
        await sendTemplateEmailLogged("meta-lead-notification", r.recipient_email, {
          idempotencyKey: `meta-lead-${args.leadgenId}-${r.recipient_email}${args.idempotencySuffix ?? ""}`,
          templateData,
        });
      } catch (sendErr) {
        console.error(`[META-EMAIL] send failed leadgen=${args.leadgenId}: ${(sendErr as Error).message}`);
      }
    }
    console.log(`[META-EMAIL] leadgen=${args.leadgenId} recipients=${recips.length}`);
  } catch (e) {
    console.error(`[META-EMAIL] notify error leadgen=${args.leadgenId}:`, (e as Error).message);
  }
}
