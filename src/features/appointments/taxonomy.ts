/**
 * Appointments — centralized taxonomy (Fase 0).
 * Single source of truth for status + outcome labels, colors and icons.
 * UI components MUST import from here instead of hardcoding strings.
 */

import {
  CalendarClock,
  CalendarCheck2,
  CalendarX2,
  CalendarOff,
  CheckCircle2,
  Clock,
  RotateCcw,
  XCircle,
  AlertTriangle,
  PhoneOff,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

// ============================================================
// STATUS — mirrors public.appointment_status enum
// ============================================================
export type AppointmentStatus =
  | "draft"
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "visited"
  | "no_show"
  | "completed";

export interface StatusMeta {
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes using semantic tokens (no raw colors). */
  badgeClass: string;
  /** Whether this is a terminal state (no further transitions expected). */
  isTerminal: boolean;
}

export const APPOINTMENT_STATUS: Record<AppointmentStatus, StatusMeta> = {
  draft: {
    label: "Bozza",
    shortLabel: "Bozza",
    description: "Appuntamento in compilazione, non ancora pianificato",
    icon: Clock,
    badgeClass: "bg-muted text-muted-foreground border-border",
    isTerminal: false,
  },
  scheduled: {
    label: "Pianificato",
    shortLabel: "Pianif.",
    description: "Appuntamento pianificato, in attesa di conferma",
    icon: CalendarClock,
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    isTerminal: false,
  },
  confirmed: {
    label: "Confermato",
    shortLabel: "Conf.",
    description: "Appuntamento confermato dal cliente",
    icon: CalendarCheck2,
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    isTerminal: false,
  },
  rescheduled: {
    label: "Riprogrammato",
    shortLabel: "Riprog.",
    description: "Spostato a una nuova data",
    icon: RotateCcw,
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    isTerminal: false,
  },
  visited: {
    label: "Visitato",
    shortLabel: "Visit.",
    description: "Visita effettuata (legacy)",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    isTerminal: true,
  },
  completed: {
    label: "Completato",
    shortLabel: "Compl.",
    description: "Appuntamento eseguito con esito registrato",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    isTerminal: true,
  },
  no_show: {
    label: "No-show",
    shortLabel: "No-show",
    description: "Cliente o operatore non presentato",
    icon: CalendarX2,
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    isTerminal: true,
  },
  cancelled: {
    label: "Annullato",
    shortLabel: "Ann.",
    description: "Appuntamento annullato",
    icon: CalendarOff,
    badgeClass: "bg-muted text-muted-foreground border-border line-through",
    isTerminal: true,
  },
};

export const APPOINTMENT_STATUS_ORDER: AppointmentStatus[] = [
  "draft",
  "scheduled",
  "confirmed",
  "rescheduled",
  "visited",
  "completed",
  "no_show",
  "cancelled",
];

export function getStatusMeta(status: string | null | undefined): StatusMeta {
  if (status && status in APPOINTMENT_STATUS) {
    return APPOINTMENT_STATUS[status as AppointmentStatus];
  }
  return {
    label: status || "Sconosciuto",
    shortLabel: "?",
    description: "Stato non riconosciuto",
    icon: HelpCircle,
    badgeClass: "bg-muted text-muted-foreground border-border",
    isTerminal: false,
  };
}

// ============================================================
// OUTCOME — mirrors public.appointment_outcome_code enum
// ============================================================
export type AppointmentOutcomeCode =
  | "executed"
  | "no_show_client"
  | "no_show_operator"
  | "cancelled_client"
  | "cancelled_operator"
  | "rescheduled"
  | "unreachable"
  | "other";

export interface OutcomeMeta {
  label: string;
  description: string;
  icon: LucideIcon;
  badgeClass: string;
  /** If true, the UI should ask for a reschedule_reason. */
  requiresRescheduleReason: boolean;
  /** If true, the UI should suggest a next_action input. */
  suggestsNextAction: boolean;
}

export const APPOINTMENT_OUTCOMES: Record<AppointmentOutcomeCode, OutcomeMeta> = {
  executed: {
    label: "Eseguito",
    description: "Appuntamento svolto regolarmente",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    requiresRescheduleReason: false,
    suggestsNextAction: true,
  },
  no_show_client: {
    label: "No-show cliente",
    description: "Il cliente non si è presentato",
    icon: CalendarX2,
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    requiresRescheduleReason: false,
    suggestsNextAction: true,
  },
  no_show_operator: {
    label: "No-show operatore",
    description: "L'operatore non si è presentato",
    icon: AlertTriangle,
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    requiresRescheduleReason: false,
    suggestsNextAction: true,
  },
  cancelled_client: {
    label: "Annullato dal cliente",
    description: "Il cliente ha annullato",
    icon: XCircle,
    badgeClass: "bg-muted text-muted-foreground border-border",
    requiresRescheduleReason: false,
    suggestsNextAction: true,
  },
  cancelled_operator: {
    label: "Annullato dall'operatore",
    description: "Annullato internamente",
    icon: XCircle,
    badgeClass: "bg-muted text-muted-foreground border-border",
    requiresRescheduleReason: false,
    suggestsNextAction: true,
  },
  rescheduled: {
    label: "Riprogrammato",
    description: "Spostato a nuova data",
    icon: RotateCcw,
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    requiresRescheduleReason: true,
    suggestsNextAction: false,
  },
  unreachable: {
    label: "Non raggiungibile",
    description: "Cliente non contattabile per conferma",
    icon: PhoneOff,
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    requiresRescheduleReason: false,
    suggestsNextAction: true,
  },
  other: {
    label: "Altro",
    description: "Esito non standard (specificare nelle note)",
    icon: HelpCircle,
    badgeClass: "bg-muted text-muted-foreground border-border",
    requiresRescheduleReason: false,
    suggestsNextAction: true,
  },
};

export const APPOINTMENT_OUTCOME_ORDER: AppointmentOutcomeCode[] = [
  "executed",
  "rescheduled",
  "no_show_client",
  "no_show_operator",
  "cancelled_client",
  "cancelled_operator",
  "unreachable",
  "other",
];

export function getOutcomeMeta(code: string | null | undefined): OutcomeMeta | null {
  if (!code) return null;
  if (code in APPOINTMENT_OUTCOMES) return APPOINTMENT_OUTCOMES[code as AppointmentOutcomeCode];
  return null;
}

// ============================================================
// TYPE — mirrors public.appointment_type enum
// ============================================================
export const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  primo_appuntamento: "1° Appuntamento",
  follow_up: "Follow-up",
  visita_tecnica: "Visita tecnica",
};

export function getTypeLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return APPOINTMENT_TYPE_LABELS[type] || type;
}
