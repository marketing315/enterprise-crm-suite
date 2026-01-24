/**
 * Escape a value for CSV (handles quotes, newlines, semicolons)
 */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // If contains semicolon, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of objects to CSV string with semicolon separator (EU format)
 */
export function arrayToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; label: string }[]
): string {
  if (data.length === 0) return "";

  // Header row
  const header = columns.map((col) => escapeCSV(col.label)).join(";");

  // Data rows
  const rows = data.map((row) =>
    columns.map((col) => escapeCSV(row[col.key])).join(";")
  );

  return [header, ...rows].join("\n");
}

/**
 * Trigger a download of a CSV file
 */
export function downloadCSV(content: string, filename: string): void {
  // Add BOM for UTF-8 Excel compatibility
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format minutes to human readable (for CSV)
 */
export function formatMinutesForCSV(minutes: number): string {
  if (minutes === 0) return "-";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
