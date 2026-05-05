import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type VersionedTable = "appointments" | "deals" | "tickets";

export class ConcurrencyConflictError extends Error {
  constructor(message = "concurrency_conflict") {
    super(message);
    this.name = "ConcurrencyConflictError";
  }
}

/**
 * A7 — Optimistic update with version check.
 * Calls RPC `update_with_version`. On conflict throws ConcurrencyConflictError
 * so the caller can refetch + show toast + let the user retry.
 */
export async function updateWithVersion<T = Record<string, unknown>>(params: {
  table: VersionedTable;
  id: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
}): Promise<T> {
  const { table, id, expectedVersion, patch } = params;
  const { data, error } = await supabase.rpc("update_with_version" as never, {
    p_table: table,
    p_id: id,
    p_expected_version: expectedVersion,
    p_patch: patch,
  } as never);
  if (error) {
    if ((error.message ?? "").includes("concurrency_conflict")) {
      throw new ConcurrencyConflictError(error.message);
    }
    throw error;
  }
  return data as unknown as T;
}

/** Convenience: handles toast + auto-refresh callback on conflict. */
export async function updateWithVersionSafe<T>(
  params: Parameters<typeof updateWithVersion<T>>[0],
  onConflict?: () => void | Promise<void>,
): Promise<T | null> {
  try {
    return await updateWithVersion<T>(params);
  } catch (e) {
    if (e instanceof ConcurrencyConflictError) {
      toast.error(
        "Il record è stato modificato da un altro utente. Ricarico i dati più recenti.",
      );
      await onConflict?.();
      return null;
    }
    throw e;
  }
}
