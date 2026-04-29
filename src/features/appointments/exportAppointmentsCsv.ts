import { format } from "date-fns";
import { arrayToCSV, downloadCSV } from "@/lib/csvExport";
import { APPOINTMENT_STATUS, type AppointmentStatus } from "@/features/appointments/taxonomy";
import type { AppointmentWithRelations } from "@/types/database";

interface ExportRow {
  data: string;
  ora: string;
  contatto: string;
  email: string;
  telefono: string;
  status: string;
  durata_min: number;
  commerciale: string;
  brand: string;
  citta: string;
  cap: string;
  indirizzo: string;
  risk_score: string;
  note: string;
  link: string;
}

function buildRow(apt: AppointmentWithRelations): ExportRow {
  const dt = new Date(apt.scheduled_at);
  const statusMeta = APPOINTMENT_STATUS[apt.status as AppointmentStatus];
  const contactName =
    [apt.contact?.first_name, apt.contact?.last_name].filter(Boolean).join(" ") || "—";
  return {
    data: format(dt, "yyyy-MM-dd"),
    ora: format(dt, "HH:mm"),
    contatto: contactName,
    email: apt.contact?.email ?? "",
    telefono: apt.contact?.primary_phone ?? "",
    status: statusMeta?.label ?? apt.status,
    durata_min: apt.duration_minutes,
    commerciale: apt.sales_user?.full_name ?? apt.sales_user?.email ?? "",
    brand: apt.brand_name ?? "",
    citta: apt.city ?? "",
    cap: apt.cap ?? "",
    indirizzo: apt.address ?? "",
    risk_score: apt.risk_score != null ? String(apt.risk_score) : "",
    note: apt.notes ?? "",
    link: `${window.location.origin}/appointments/${apt.id}`,
  };
}

const COLUMNS: { key: keyof ExportRow; label: string }[] = [
  { key: "data", label: "Data" },
  { key: "ora", label: "Ora" },
  { key: "contatto", label: "Contatto" },
  { key: "email", label: "Email" },
  { key: "telefono", label: "Telefono" },
  { key: "status", label: "Stato" },
  { key: "durata_min", label: "Durata (min)" },
  { key: "commerciale", label: "Commerciale" },
  { key: "brand", label: "Brand" },
  { key: "citta", label: "Città" },
  { key: "cap", label: "CAP" },
  { key: "indirizzo", label: "Indirizzo" },
  { key: "risk_score", label: "Risk score" },
  { key: "note", label: "Note" },
  { key: "link", label: "Link" },
];

export function exportAppointmentsCsv(
  appointments: AppointmentWithRelations[],
  filenamePrefix = "appuntamenti"
): number {
  const rows = appointments.map(buildRow);
  const csv = arrayToCSV(rows, COLUMNS);
  const stamp = format(new Date(), "yyyyMMdd-HHmm");
  downloadCSV(csv, `${filenamePrefix}-${stamp}.csv`);
  return rows.length;
}
