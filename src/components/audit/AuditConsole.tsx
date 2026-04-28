import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Download, Loader2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useAuditEvents, type AuditFilters } from "@/hooks/useAuditEvents";
import { logAuditAccess } from "@/hooks/useAuditDashboard";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { AuditActionTag } from "@/components/audit/AuditActionTag";
import { AuditActorBadge } from "@/components/audit/AuditActorBadge";
import { AuditDiffViewer } from "@/components/audit/AuditDiffViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DateRangeFilter } from "@/components/contacts/DateRangeFilter";
import { Badge } from "@/components/ui/badge";

const ENTITY_TYPES = [
  { value: "all", label: "Tutte le entità" },
  { value: "contact", label: "Contatti" },
  { value: "deal", label: "Deal" },
  { value: "ticket", label: "Ticket" },
  { value: "appointment", label: "Appuntamenti" },
  { value: "tag_assignment", label: "Tag" },
];

const ACTION_TYPES = [
  { value: "all", label: "Tutte le azioni" },
  { value: "create", label: "Creazione" },
  { value: "update", label: "Modifica" },
  { value: "delete", label: "Eliminazione" },
  { value: "status_change", label: "Cambio stato" },
  { value: "stage_change", label: "Cambio fase" },
];

const entityLabels: Record<string, string> = {
  contact: "Contatto",
  deal: "Deal",
  ticket: "Ticket",
  appointment: "Appuntamento",
  tag_assignment: "Tag",
};

export function AuditConsole() {
  const [page, setPage] = useState(0);
  const [entityType, setEntityType] = useState("all");
  const [actionType, setActionType] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { currentBrand } = useBrand();
  const { user } = useAuth();

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters: AuditFilters = useMemo(() => ({
    entityType: entityType === "all" ? undefined : entityType,
    action: actionType === "all" ? undefined : actionType,
    dateFrom,
    dateTo,
    search: search || undefined,
  }), [entityType, actionType, dateFrom, dateTo, search]);

  const { data, isLoading } = useAuditEvents(filters, page);
  const events = data?.events || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  // Log console view (once per filter/page change)
  useEffect(() => {
    if (!currentBrand?.id || isLoading) return;
    logAuditAccess(currentBrand.id, "console_view", {
      entityType, actionType, page, search,
      dateFrom: dateFrom?.toISOString(),
      dateTo: dateTo?.toISOString(),
    }, total);
  }, [currentBrand?.id, entityType, actionType, page, search, dateFrom, dateTo, isLoading, total]);

  const handleExportCSV = async () => {
    if (events.length === 0) return;

    // Watermark header
    const exportedAt = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    const exportedBy = user?.email || "unknown";
    const exportedById = user?.id || "unknown";
    const filename = `audit_log_${format(new Date(), "yyyy-MM-dd_HHmmss")}.csv`;
    const watermark = [
      `# Export Audit Log`,
      `# Generated: ${exportedAt}`,
      `# By: ${exportedBy}`,
      `# Brand: ${currentBrand?.name ?? currentBrand?.id ?? "—"}`,
      `# Filters: entity=${entityType} action=${actionType} search="${search}" from=${dateFrom?.toISOString() ?? "—"} to=${dateTo?.toISOString() ?? "—"}`,
      `# Records: ${events.length} (page ${page + 1}/${totalPages || 1})`,
      ``,
    ].join("\n");

    const headers = ["Data", "Entità", "ID Entità", "Azione", "Attore", "Tipo attore", "Source", "Campi modificati"];
    const rows = events.map(e => [
      format(new Date(e.occurred_at), "yyyy-MM-dd HH:mm:ss"),
      e.entity_type,
      e.entity_id,
      e.action,
      e.actor_display_name || "",
      e.actor_type,
      e.source,
      e.changed_fields?.join(", ") || "",
    ]);
    const csv = watermark + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

    // Compute SHA-256 digest of CSV bytes for compliance signature
    const csvBytes = new TextEncoder().encode(csv);
    const digestBuf = await crypto.subtle.digest("SHA-256", csvBytes);
    const digestHex = Array.from(new Uint8Array(digestBuf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Download CSV
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    // Sidecar manifest with integrity signature
    const manifest = {
      schema: "lovable.audit.export.v1",
      filename,
      exported_at: new Date().toISOString(),
      exported_by: { id: exportedById, email: exportedBy },
      brand: { id: currentBrand?.id ?? null, name: currentBrand?.name ?? null },
      filters: {
        entity_type: entityType,
        action: actionType,
        search,
        date_from: dateFrom?.toISOString() ?? null,
        date_to: dateTo?.toISOString() ?? null,
      },
      record_count: events.length,
      total_count: total,
      page: page + 1,
      total_pages: totalPages || 1,
      bytes: csvBytes.byteLength,
      algorithm: "SHA-256",
      digest_hex: digestHex,
    };
    const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const manifestUrl = URL.createObjectURL(manifestBlob);
    const ma = document.createElement("a");
    ma.href = manifestUrl;
    ma.download = `${filename}.sig.json`;
    ma.click();
    URL.revokeObjectURL(manifestUrl);

    // Log export with digest in reason for traceability
    await logAuditAccess(currentBrand?.id ?? null, "export", {
      entityType, actionType, search,
      dateFrom: dateFrom?.toISOString(),
      dateTo: dateTo?.toISOString(),
      digest_sha256: digestHex,
      filename,
    }, events.length, `CSV export — SHA-256: ${digestHex.slice(0, 16)}…`);
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Audit Log</h2>
          <p className="text-sm text-muted-foreground">
            {total} eventi registrati
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV} disabled={events.length === 0} title="Scarica CSV + manifest .sig.json con SHA-256 per verifica integrità">
          <Download className="h-4 w-4" />
          Esporta CSV firmato
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cerca azione, attore, campo, ID…"
            className="w-[260px] pl-8 h-9"
          />
        </div>
        <Select value={entityType} onValueChange={v => { setEntityType(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionType} onValueChange={v => { setActionType(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeFilter
          fromDate={dateFrom}
          toDate={dateTo}
          onFromDateChange={(d) => { setDateFrom(d); setPage(0); }}
          onToDateChange={(d) => { setDateTo(d); setPage(0); }}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Nessun evento trovato</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Data</TableHead>
                <TableHead className="w-[100px]">Entità</TableHead>
                <TableHead className="w-[120px]">Azione</TableHead>
                <TableHead className="w-[180px]">Attore</TableHead>
                <TableHead className="w-[80px]">Source</TableHead>
                <TableHead>Dettagli</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map(event => {
                const isExpanded = expandedRow === event.id;
                const hasDetails = event.changed_fields && event.changed_fields.length > 0;

                return (
                  <TableRow
                    key={event.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => hasDetails && setExpandedRow(isExpanded ? null : event.id)}
                  >
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(event.occurred_at), "dd MMM yyyy HH:mm:ss", { locale: it })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {entityLabels[event.entity_type] || event.entity_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AuditActionTag action={event.action} />
                    </TableCell>
                    <TableCell>
                      <AuditActorBadge actorType={event.actor_type} displayName={event.actor_display_name} />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{event.source}</span>
                    </TableCell>
                    <TableCell>
                      {isExpanded && hasDetails ? (
                        <AuditDiffViewer
                          oldValue={event.old_value}
                          newValue={event.new_value}
                          changedFields={event.changed_fields}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {event.changed_fields?.length
                            ? `${event.changed_fields.length} campo/i`
                            : "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Pagina {page + 1} di {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
              Precedente
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Successiva
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
