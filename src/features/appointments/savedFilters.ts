/**
 * Sistema di filtri salvati per appuntamenti.
 * Persistenza in localStorage validata con Zod (resilienza a stati corrotti).
 * Preset di sistema sempre disponibili + preset utente CRUD.
 */
import { z } from "zod";
import type { AppointmentWithRelations } from "@/types/database";

// ─── Schema ─────────────────────────────────────────────────────────────

export const APPOINTMENT_STATUS_VALUES = [
  "draft",
  "scheduled",
  "confirmed",
  "visited",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
] as const;

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const AppointmentFilterSchema = z.object({
  statuses: z.array(z.enum(APPOINTMENT_STATUS_VALUES)).optional(),
  riskLevels: z.array(z.enum(RISK_LEVELS)).optional(),
  /** Solo gli appuntamenti dell'utente loggato (resolved at use-time) */
  onlyMine: z.boolean().optional(),
  /** Solo follow-up con `next_action_at` ≤ ora */
  pendingFollowUp: z.boolean().optional(),
  /** Solo no-show ultimi N giorni (filtro time-window aggiuntivo client-side) */
  noShowLastDays: z.number().int().positive().max(365).optional(),
});

export type AppointmentFilter = z.infer<typeof AppointmentFilterSchema>;

export const SavedFilterSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  filter: AppointmentFilterSchema,
  createdAt: z.string(),
});

export type SavedFilter = z.infer<typeof SavedFilterSchema>;

const SavedFilterListSchema = z.array(SavedFilterSchema);

// ─── Storage ────────────────────────────────────────────────────────────

const STORAGE_KEY = "appointments.savedFilters.v1";
const ACTIVE_KEY_PREFIX = "appointments.activeFilter.";

export function loadUserFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = SavedFilterListSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      // stato corrotto → reset silenzioso
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return parsed.data;
  } catch {
    return [];
  }
}

export function saveUserFilters(list: SavedFilter[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode → no-op */
  }
}

export function loadActiveFilterId(scope: string): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY_PREFIX + scope);
  } catch {
    return null;
  }
}

export function saveActiveFilterId(scope: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY_PREFIX + scope, id);
    else localStorage.removeItem(ACTIVE_KEY_PREFIX + scope);
  } catch {
    /* no-op */
  }
}

// ─── Preset di sistema ──────────────────────────────────────────────────

export const SYSTEM_FILTERS: SavedFilter[] = [
  {
    id: "sys.high-risk",
    name: "Alto rischio",
    createdAt: "system",
    filter: { riskLevels: ["high"] },
  },
  {
    id: "sys.my-high-risk",
    name: "I miei alto rischio",
    createdAt: "system",
    filter: { riskLevels: ["high", "medium"], onlyMine: true },
  },
  {
    id: "sys.pending-followup",
    name: "Follow-up scaduti",
    createdAt: "system",
    filter: { pendingFollowUp: true },
  },
  {
    id: "sys.noshow-30d",
    name: "No-show 30gg",
    createdAt: "system",
    filter: { statuses: ["no_show"], noShowLastDays: 30 },
  },
  {
    id: "sys.unconfirmed",
    name: "Non confermati",
    createdAt: "system",
    filter: { statuses: ["draft", "scheduled"] },
  },
];

export function isSystemFilter(id: string): boolean {
  return id.startsWith("sys.");
}

// ─── Applicazione filtro client-side ────────────────────────────────────

function riskLevelOf(score: number | null | undefined): RiskLevel {
  const s = score ?? 0;
  if (s >= 60) return "high";
  if (s >= 30) return "medium";
  return "low";
}

export interface ApplyFilterContext {
  /** Internal user ID (non Supabase auth ID) usato per `onlyMine` */
  currentUserId?: string | null;
}

export function applyAppointmentFilter(
  appointments: AppointmentWithRelations[],
  filter: AppointmentFilter | undefined,
  ctx: ApplyFilterContext = {}
): AppointmentWithRelations[] {
  if (!filter) return appointments;
  const now = Date.now();
  const noShowCutoff = filter.noShowLastDays
    ? now - filter.noShowLastDays * 24 * 60 * 60 * 1000
    : null;

  return appointments.filter((a) => {
    if (filter.statuses?.length && !filter.statuses.includes(a.status as never)) {
      return false;
    }
    if (filter.riskLevels?.length) {
      const level = riskLevelOf((a as { risk_score?: number | null }).risk_score);
      if (!filter.riskLevels.includes(level)) return false;
    }
    if (filter.onlyMine) {
      if (!ctx.currentUserId) return false;
      if (a.assigned_sales_user_id !== ctx.currentUserId) return false;
    }
    if (filter.pendingFollowUp) {
      const next = (a as { next_action_at?: string | null }).next_action_at;
      if (!next) return false;
      if (new Date(next).getTime() > now) return false;
    }
    if (noShowCutoff !== null) {
      const t = new Date(a.scheduled_at).getTime();
      if (t < noShowCutoff) return false;
    }
    return true;
  });
}

// ─── Helper short-uuid (no extra deps) ──────────────────────────────────

export function newFilterId(): string {
  return "usr." + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
