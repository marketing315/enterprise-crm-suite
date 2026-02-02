/**
 * Format KPI values with proper null handling
 * When value is null/undefined, returns "—" placeholder
 */

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `€${value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("it-IT");
}

/**
 * Get color class for ROI/percentage values
 * Returns empty string if value is null
 */
export function getPercentColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-muted-foreground";
  return value >= 0 ? "text-green-600" : "text-red-600";
}
