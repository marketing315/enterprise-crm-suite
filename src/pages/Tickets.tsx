import { useState, useCallback } from "react";
import { Ticket, Download, CheckSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketsTable } from "@/components/tickets/TicketsTable";
import { TicketDetailSheet } from "@/components/tickets/TicketDetailSheet";
import { TicketFilters } from "@/components/tickets/TicketFilters";
import { TicketQueueTabs } from "@/components/tickets/TicketQueueTabs";
import { TicketBulkActionsBar } from "@/components/tickets/TicketBulkActionsBar";
import { TicketStatus, TicketWithRelations, useAssignTicket } from "@/hooks/useTickets";
import { useTicketsSearch, useTicketQueueCounts, QueueTab, AssignmentTypeFilter } from "@/hooks/useTicketsSearch";
import { useTicketBulkUpdate, useTicketBulkAssignToMe } from "@/hooks/useTicketBulkActions";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { exportTicketsToCSV } from "@/lib/ticketCsvExport";
import { toast } from "sonner";

const PAGE_SIZE = 50;

export default function Tickets() {
  // Queue tab (stored in localStorage)
  const [activeTab, setActiveTab] = useState<QueueTab>(() => {
    const saved = localStorage.getItem("ticketQueueTab");
    return (saved as QueueTab) || "all";
  });

  // Search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [assignmentTypeFilter, setAssignmentTypeFilter] = useState<AssignmentTypeFilter>("all");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  
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

  // Server-side search with all filters
  const { data: searchResult, isLoading } = useTicketsSearch({
    queueTab: activeTab,
    searchQuery: searchQuery.trim() || undefined,
    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    assignmentType: assignmentTypeFilter,
    limit: PAGE_SIZE,
    offset: currentPage * PAGE_SIZE,
  });

  // Queue counts (lightweight separate query)
  const { data: queueCounts } = useTicketQueueCounts();

  const tickets = searchResult?.tickets || [];
  const totalCount = searchResult?.totalCount || 0;
  const hasMore = searchResult?.hasMore || false;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Handle tab change - reset pagination
  const handleTabChange = useCallback((tab: QueueTab) => {
    setActiveTab(tab);
    setCurrentPage(0);
    localStorage.setItem("ticketQueueTab", tab);
  }, []);

  // Handle filter changes - reset pagination
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(0);
  }, []);

  const handleTagsChange = useCallback((tagIds: string[]) => {
    setSelectedTagIds(tagIds);
    setCurrentPage(0);
  }, []);

  const handleAssignmentTypeChange = useCallback((type: AssignmentTypeFilter) => {
    setAssignmentTypeFilter(type);
    setCurrentPage(0);
  }, []);

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

  // Counts for assignment type filter (calculated from current page - approximate)
  const autoCount = tickets.filter((t) => t.assigned_at && !t.assigned_by_user_id).length;
  const manualCount = tickets.filter((t) => t.assigned_by_user_id).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Ticket className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Ticket</h1>
            <p className="text-muted-foreground">
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
            <CheckSquare className="h-4 w-4 mr-2" />
            {bulkMode ? "Esci selezione" : "Selezione multipla"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={tickets.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV ({tickets.length})
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Pagina {currentPage + 1} di {totalPages} ({totalCount} ticket totali)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={!hasMore}
            >
              Successiva
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
