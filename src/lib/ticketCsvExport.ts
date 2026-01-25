import { format } from "date-fns";
import { it } from "date-fns/locale";
import { TicketWithRelations } from "@/hooks/useTickets";
import { SlaThresholds, DEFAULT_SLA_THRESHOLDS } from "@/hooks/useBrandSettings";
import { getAgeInMinutes, isSlaBreached, QueueTab } from "@/hooks/useTicketQueue";
import { arrayToCSV, downloadCSV, formatMinutesForCSV } from "./csvExport";

interface TicketExportRow {
  [key: string]: unknown;
  id: string;
  created_at: string;
  opened_at: string;
  status: string;
  priority: string;
  title: string;
  category: string;
  contact_name: string;
  contact_email: string;
  assigned_to: string;
  assigned_at: string;
  assigned_by: string;
  aging: string;
  aging_minutes: number;
  sla_threshold: string;
  sla_threshold_minutes: number;
  sla_breached: string;
}

const STATUS_LABELS: Record<string, string> = {
  open: "Aperto",
  in_progress: "In lavorazione",
  resolved: "Risolto",
  closed: "Chiuso",
  reopened: "Riaperto",
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "P1 - Critica",
  2: "P2 - Alta",
  3: "P3 - Media",
  4: "P4 - Bassa",
  5: "P5 - Minima",
};

const TAB_LABELS: Record<QueueTab, string> = {
  my_queue: "MiaQueue",
  unassigned: "NonAssegnati",
  sla_breached: "ScadutiSLA",
  all: "Tutti",
};

function formatDateForCSV(dateString: string | null): string {
  if (!dateString) return "";
  return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: it });
}

function getContactName(ticket: TicketWithRelations): string {
  if (!ticket.contacts) return "";
  const { first_name, last_name } = ticket.contacts;
  return `${first_name || ""} ${last_name || ""}`.trim();
}

export function exportTicketsToCSV(
  tickets: TicketWithRelations[],
  options: {
    brandName: string;
    activeTab: QueueTab;
    slaThresholds?: SlaThresholds;
  }
): void {
  const { brandName, activeTab, slaThresholds = DEFAULT_SLA_THRESHOLDS } = options;

  const rows: TicketExportRow[] = tickets.map((ticket) => {
    const ageMinutes = getAgeInMinutes(ticket);
    const priorityKey = String(ticket.priority) as keyof SlaThresholds;
    const slaThreshold = slaThresholds[priorityKey] ?? DEFAULT_SLA_THRESHOLDS["3"];
    const breached = isSlaBreached(ticket, slaThresholds);

    return {
      id: ticket.id,
      created_at: formatDateForCSV(ticket.created_at),
      opened_at: formatDateForCSV(ticket.opened_at),
      status: STATUS_LABELS[ticket.status] || ticket.status,
      priority: PRIORITY_LABELS[ticket.priority] || `P${ticket.priority}`,
      title: ticket.title,
      category: ticket.tags?.name || "",
      contact_name: getContactName(ticket),
      contact_email: ticket.contacts?.email || "",
      assigned_to: ticket.users?.full_name || ticket.users?.email || "",
      assigned_at: formatDateForCSV(ticket.assigned_at),
      assigned_by: ticket.assigned_at 
        ? (ticket.assigned_by_user_id ? "Manuale" : "Auto")
        : "",
      aging: formatMinutesForCSV(ageMinutes),
      aging_minutes: ageMinutes,
      sla_threshold: formatMinutesForCSV(slaThreshold),
      sla_threshold_minutes: slaThreshold,
      sla_breached: breached ? "Sì" : "No",
    };
  });

  const columns: { key: keyof TicketExportRow; label: string }[] = [
    { key: "id", label: "ID Ticket" },
    { key: "created_at", label: "Creato il" },
    { key: "opened_at", label: "Aperto il" },
    { key: "status", label: "Stato" },
    { key: "priority", label: "Priorità" },
    { key: "title", label: "Titolo" },
    { key: "category", label: "Categoria" },
    { key: "contact_name", label: "Contatto" },
    { key: "contact_email", label: "Email" },
    { key: "assigned_to", label: "Assegnato a" },
    { key: "assigned_at", label: "Assegnato il" },
    { key: "assigned_by", label: "Tipo Assegnazione" },
    { key: "aging", label: "Aging" },
    { key: "aging_minutes", label: "Aging (minuti)" },
    { key: "sla_threshold", label: "Soglia SLA" },
    { key: "sla_threshold_minutes", label: "Soglia SLA (minuti)" },
    { key: "sla_breached", label: "SLA Superato" },
  ];

  const csv = arrayToCSV(rows, columns);

  // Generate filename: Brand_Tab_YYYYMMDD_HHMM.csv
  const now = new Date();
  const dateStr = format(now, "yyyyMMdd_HHmm");
  const sanitizedBrand = brandName.replace(/[^a-zA-Z0-9]/g, "_");
  const tabLabel = TAB_LABELS[activeTab];
  const filename = `Tickets_${sanitizedBrand}_${tabLabel}_${dateStr}.csv`;

  downloadCSV(csv, filename);
}
