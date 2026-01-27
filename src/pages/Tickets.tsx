import { useState, useCallback } from "react";
import { Ticket, Download, CheckSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketsTable } from "@/components/tickets/TicketsTable";
import { TicketDetailSheet } from "@/components/tickets/TicketDetailSheet";
import { TicketFilters } from "@/components/tickets/TicketFilters";
import { TicketQueueTabs } from "@/components/tickets/TicketQueueTabs";
import { TicketBulkActionsBar } from "@/components/tickets/TicketBulkActionsBar";
import { TicketStatus, TicketWithRelations, useAssignTicket } from "@/hooks/useTickets";
import { useTicketsSearch, useTicketQueueCounts, TicketCursor } from "@/hooks/useTicketsSearch";
import { useTicketBulkUpdate, useTicketBulkAssignToMe } from "@/hooks/useTicketBulkActions";
import { useTicketUrlState } from "@/hooks/useTicketUrlState";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { exportTicketsToCSV } from "@/lib/ticketCsvExport";
import { toast } from "sonner";

const PAGE_SIZE = 50;

export default function Tickets() {
  // URL-based state for refresh-safe navigation
  const { state: urlState, updateUrl, resetPagination } = useTicketUrlState();
  
  // Destructure URL state
  const {
    tab: activeTab,
    searchQuery,
    tagIds: selectedTagIds,
    assignmentType: assignmentTypeFilter,
    cursor,
    direction,
    pageStack: pageStartStack,
  } = urlState;
  
  // Detail sheet
  const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  const { supabaseUser, hasRole } = useAuth();
  const { currentBrand } = useBrand();
  const { data: operators = [] } = useBrandOperators();
  const { data: brandSettings } = useBrandSettings();
  const assignTicket = useAssignTicket();
  const bulkUpdate = useTicketBulkUpdate();
  const bulkAssignToMe = useTicketBulkAssignToMe();

  // Get SLA thresholds from brand settings
  const slaThresholds = brandSettings?.sla_thresholds_minutes;

  // Get current user's operator ID
  const currentOperator = operators.find(
    (op) => op.supabase_auth_id === supabaseUser?.id
  );

  const isOperator = hasRole("callcenter") || hasRole("admin");

  // Server-side search with cursor pagination
  const { data: searchResult, isLoading } = useTicketsSearch({
    queueTab: activeTab,
    searchQuery: searchQuery.trim() || undefined,
    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    assignmentType: assignmentTypeFilter,
    limit: PAGE_SIZE,
    cursor,
    direction,
  });

  // Queue counts (lightweight separate query) - includes contextual auto/manual counts
  const { data: queueCounts } = useTicketQueueCounts({
    queueTab: activeTab,
    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
  });

  const tickets = searchResult?.tickets || [];
  const totalCount = searchResult?.totalCount || 0;
  const hasNext = searchResult?.hasNext || false;
  const hasPrev = pageStartStack.length > 0;

  // Server-side auto/manual counts
  const autoCount = queueCounts?.auto_count ?? 0;
  const manualCount = queueCounts?.manual_count ?? 0;

  // Get cursor for current page start (first ticket)
  const pageStartCursor: TicketCursor | null = tickets.length > 0
    ? { priority: tickets[0].priority, opened_at: tickets[0].opened_at, id: tickets[0].id }
    : null;

  // Reset selection when filters/tab/page change
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Handle tab change - reset pagination and selection
  const handleTabChange = useCallback((tab: typeof activeTab) => {
    updateUrl({ tab });
    resetPagination();
    clearSelection();
  }, [updateUrl, resetPagination, clearSelection]);

  // Handle filter changes - reset pagination
  const handleSearchChange = useCallback((query: string) => {
    updateUrl({ searchQuery: query });
    resetPagination();
    // Don't clear selection on search - user might be refining
  }, [updateUrl, resetPagination]);

  const handleTagsChange = useCallback((tagIds: string[]) => {
    updateUrl({ tagIds });
    resetPagination();
    clearSelection();
  }, [updateUrl, resetPagination, clearSelection]);

  const handleAssignmentTypeChange = useCallback((type: typeof assignmentTypeFilter) => {
    updateUrl({ assignmentType: type });
    resetPagination();
    clearSelection();
  }, [updateUrl, resetPagination, clearSelection]);

  // Cursor pagination handlers
  const handleNextPage = useCallback(() => {
    if (!hasNext || !searchResult?.nextCursor) return;
    // Save current page start for "back" navigation
    if (pageStartCursor) {
      updateUrl({ 
        cursor: searchResult.nextCursor, 
        direction: "next",
        pageStack: [...pageStartStack, pageStartCursor],
      });
    }
    clearSelection();
  }, [hasNext, searchResult?.nextCursor, pageStartCursor, pageStartStack, updateUrl, clearSelection]);

  const handlePrevPage = useCallback(() => {
    if (pageStartStack.length === 0) return;
    const newStack = pageStartStack.slice(0, -1);
    const prevStart = pageStartStack[pageStartStack.length - 1];
    updateUrl({
      cursor: prevStart,
      direction: "prev",
      pageStack: newStack,
    });
    clearSelection();
  }, [pageStartStack, updateUrl, clearSelection]);

  const handleTicketClick = (ticket: TicketWithRelations) => {
    setSelectedTicket(ticket);
    setSheetOpen(true);
  };

  const handleTakeOwnership = async (ticket: TicketWithRelations, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentOperator) {
      toast.error("Non sei autorizzato ad assegnare ticket");
      return;
    }
    try {
      await assignTicket.mutateAsync({ 
        ticketId: ticket.id, 
        userId: currentOperator.user_id 
      });
      toast.success("Ticket preso in carico");
    } catch {
      toast.error("Errore nell'assegnazione");
    }
  };

  const handleExportCSV = () => {
    if (!currentBrand) return;
    exportTicketsToCSV(tickets, {
      brandName: currentBrand.name,
      activeTab,
      slaThresholds,
    });
    toast.success(`Esportati ${tickets.length} ticket`);
  };

  // Bulk action handlers
  const isBulkLoading = bulkUpdate.isPending || bulkAssignToMe.isPending;

  const handleClearSelection = () => {
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  const handleBulkAssignToMe = async () => {
    const ids = Array.from(selectedIds);
    try {
      await bulkAssignToMe.mutateAsync(ids);
      toast.success(`${ids.length} ticket presi in carico`);
      handleClearSelection();
    } catch {
      toast.error("Errore nell'assegnazione batch");
    }
  };

  const handleBulkAssignTo = async (userId: string) => {
    const ids = Array.from(selectedIds);
    try {
      await bulkUpdate.mutateAsync({
        ticketIds: ids,
        assignToUserId: userId || null,
      });
      toast.success(userId ? `${ids.length} ticket assegnati` : `${ids.length} ticket de-assegnati`);
      handleClearSelection();
    } catch {
      toast.error("Errore nell'assegnazione batch");
    }
  };

  const handleBulkChangeStatus = async (status: TicketStatus) => {
    const ids = Array.from(selectedIds);
    try {
      await bulkUpdate.mutateAsync({ ticketIds: ids, status });
      toast.success(`Stato aggiornato su ${ids.length} ticket`);
      handleClearSelection();
    } catch {
      toast.error("Errore nell'aggiornamento batch");
    }
  };

  const handleBulkChangePriority = async (priority: number) => {
    const ids = Array.from(selectedIds);
    try {
      await bulkUpdate.mutateAsync({ ticketIds: ids, priority });
      toast.success(`Priorità aggiornata su ${ids.length} ticket`);
      handleClearSelection();
    } catch {
      toast.error("Errore nell'aggiornamento batch");
    }
  };

  const handleBulkChangeCategory = async (tagId: string | null) => {
    const ids = Array.from(selectedIds);
    try {
      await bulkUpdate.mutateAsync({ ticketIds: ids, categoryTagId: tagId });
      toast.success(`Categoria aggiornata su ${ids.length} ticket`);
      handleClearSelection();
    } catch {
      toast.error("Errore nell'aggiornamento batch");
    }
  };


  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Ticket className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Ticket</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">
              Gestisci le richieste di assistenza
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={bulkMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setBulkMode(!bulkMode);
              if (bulkMode) setSelectedIds(new Set());
            }}
          >
            <CheckSquare className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{bulkMode ? "Esci selezione" : "Selezione multipla"}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={tickets.length === 0}
          >
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">({tickets.length})</span>
          </Button>
        </div>
      </div>

      {/* Queue Tabs */}
      <TicketQueueTabs
        value={activeTab}
        onChange={handleTabChange}
        counts={{
          all: queueCounts?.all ?? 0,
          myQueue: queueCounts?.my_queue ?? 0,
          unassigned: queueCounts?.unassigned ?? 0,
          slaBreached: queueCounts?.sla_breached ?? 0,
        }}
        showMyQueue={isOperator}
      />

      {/* Advanced Filters */}
      <TicketFilters
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        selectedTagIds={selectedTagIds}
        onTagsChange={handleTagsChange}
        assigneeFilter="all"
        onAssigneeChange={() => {}}
        operators={operators}
        assignmentTypeFilter={assignmentTypeFilter}
        onAssignmentTypeChange={handleAssignmentTypeChange}
        autoCount={autoCount}
        manualCount={manualCount}
        hideAssigneeFilter={activeTab !== "all"}
      />

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <TicketsTable 
          tickets={tickets} 
          onTicketClick={handleTicketClick}
          onTakeOwnership={currentOperator ? handleTakeOwnership : undefined}
          showSlaIndicator
          slaThresholds={slaThresholds}
          showCheckboxes={bulkMode}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      )}

      {/* Cursor Pagination */}
      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {totalCount} ticket trovati
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={!hasPrev || isLoading}
              data-testid="tickets-prev"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Precedenti
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!hasNext || isLoading}
              data-testid="tickets-next"
            >
              Successivi
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <TicketDetailSheet
        ticket={selectedTicket}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      {/* Bulk Actions Bar */}
      <TicketBulkActionsBar
        selectedCount={selectedIds.size}
        onClearSelection={handleClearSelection}
        onAssignToMe={handleBulkAssignToMe}
        onAssignTo={handleBulkAssignTo}
        onChangeStatus={handleBulkChangeStatus}
        onChangePriority={handleBulkChangePriority}
        onChangeCategory={handleBulkChangeCategory}
        operators={operators}
        isLoading={isBulkLoading}
      />
    </div>
  );
}
