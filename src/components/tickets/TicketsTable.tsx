import { formatDistanceToNow, format } from "date-fns";
import { it } from "date-fns/locale";
import { User, Clock, Hand, AlertTriangle, Archive, ArchiveRestore, Trash2, MoreHorizontal, UserPlus, Tag, Circle, ChevronRight, Ticket as TicketIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { 
  TicketWithRelations, 
  TicketStatus,
  useArchiveTicket, 
  useDeleteTicket,
  useUpdateTicketStatus,
  useUpdateTicketPriority,
  useUpdateTicketCategory,
  useAssignTicket,
} from "@/hooks/useTickets";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { useTags } from "@/hooks/useTags";
import { isSlaBreached } from "@/hooks/useTicketQueue";
import { SlaThresholds } from "@/hooks/useBrandSettings";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { TicketCardMobile } from "./TicketCardMobile";

interface TicketsTableProps {
  tickets: TicketWithRelations[];
  onTicketClick: (ticket: TicketWithRelations) => void;
  onTakeOwnership?: (ticket: TicketWithRelations, e: React.MouseEvent) => void;
  showSlaIndicator?: boolean;
  slaThresholds?: SlaThresholds;
  // Bulk selection
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  showCheckboxes?: boolean;
}

export function TicketsTable({ 
  tickets, 
  onTicketClick, 
  onTakeOwnership, 
  showSlaIndicator = false,
  slaThresholds,
  selectedIds = new Set(),
  onSelectionChange,
  showCheckboxes = false,
}: TicketsTableProps) {
  const isMobile = useIsMobile();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<string | null>(null);
  
  const archiveTicket = useArchiveTicket();
  const deleteTicket = useDeleteTicket();
  const updateStatus = useUpdateTicketStatus();
  const updatePriority = useUpdateTicketPriority();
  const updateCategory = useUpdateTicketCategory();
  const assignTicket = useAssignTicket();
  
  const { supabaseUser } = useAuth();
  const { data: operators = [] } = useBrandOperators();
  const { data: categoryTags = [] } = useTags("ticket");
  
  const currentOperator = operators.find((op) => op.supabase_auth_id === supabaseUser?.id);

  const getContactName = (ticket: TicketWithRelations) => {
    if (!ticket.contacts) return "—";
    const { first_name, last_name, email } = ticket.contacts;
    if (first_name || last_name) {
      return `${first_name || ""} ${last_name || ""}`.trim();
    }
    return email || "—";
  };

  const getAging = (openedAt: string) => {
    return formatDistanceToNow(new Date(openedAt), { locale: it, addSuffix: false });
  };

  const allSelected = tickets.length > 0 && tickets.every((t) => selectedIds.has(t.id));
  const someSelected = tickets.some((t) => selectedIds.has(t.id)) && !allSelected;

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      const newSet = new Set(selectedIds);
      tickets.forEach((t) => newSet.add(t.id));
      onSelectionChange(newSet);
    } else {
      const newSet = new Set(selectedIds);
      tickets.forEach((t) => newSet.delete(t.id));
      onSelectionChange(newSet);
    }
  };

  const handleSelectOne = (ticketId: string, checked: boolean) => {
    if (!onSelectionChange) return;
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(ticketId);
    } else {
      newSet.delete(ticketId);
    }
    onSelectionChange(newSet);
  };

  const colSpan = (showCheckboxes ? 1 : 0) + 8 + (onTakeOwnership ? 1 : 0);

  const handleTakeOwnershipInternal = async (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentOperator) return;
    try {
      await assignTicket.mutateAsync({ ticketId, userId: currentOperator.user_id });
      toast.success("Ticket preso in carico");
    } catch {
      toast.error("Errore nell'assegnazione");
    }
  };

  const handleAssign = async (ticketId: string, userId: string | null) => {
    try {
      await assignTicket.mutateAsync({ ticketId, userId });
      toast.success(userId ? "Ticket assegnato" : "Assegnazione rimossa");
    } catch {
      toast.error("Errore nell'assegnazione");
    }
  };

  const handleStatusChange = async (ticketId: string, status: TicketStatus) => {
    try {
      await updateStatus.mutateAsync({ ticketId, status });
      toast.success("Stato aggiornato");
    } catch {
      toast.error("Errore nell'aggiornamento");
    }
  };

  const handlePriorityChange = async (ticketId: string, priority: number) => {
    try {
      await updatePriority.mutateAsync({ ticketId, priority });
      toast.success("Priorità aggiornata");
    } catch {
      toast.error("Errore nell'aggiornamento");
    }
  };

  const handleCategoryChange = async (ticketId: string, categoryTagId: string | null) => {
    try {
      await updateCategory.mutateAsync({ ticketId, categoryTagId });
      toast.success("Categoria aggiornata");
    } catch {
      toast.error("Errore nell'aggiornamento");
    }
  };

  const statusOptions: { value: TicketStatus; label: string }[] = [
    { value: "open", label: "Aperto" },
    { value: "in_progress", label: "In Lavorazione" },
    { value: "resolved", label: "Risolto" },
    { value: "closed", label: "Chiuso" },
  ];

  const priorityOptions = [
    { value: 1, label: "Critica", color: "text-red-500" },
    { value: 2, label: "Alta", color: "text-orange-500" },
    { value: 3, label: "Media", color: "text-yellow-500" },
    { value: 4, label: "Bassa", color: "text-blue-500" },
    { value: 5, label: "Minima", color: "text-muted-foreground" },
  ];

  const handleArchive = async (ticketId: string, currentArchived: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await archiveTicket.mutateAsync({ ticketId, archived: !currentArchived });
      toast.success(currentArchived ? "Ticket ripristinato" : "Ticket archiviato");
    } catch {
      toast.error("Errore nell'archiviazione");
    }
  };

  const handleDeleteClick = (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTicketToDelete(ticketId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ticketToDelete) return;
    try {
      await deleteTicket.mutateAsync(ticketToDelete);
      toast.success("Ticket eliminato");
    } catch {
      toast.error("Errore nell'eliminazione");
    } finally {
      setDeleteDialogOpen(false);
      setTicketToDelete(null);
    }
  };

  if (isMobile) {
    if (tickets.length === 0) {
      return (
        <EmptyState
          icon={AlertTriangle}
          title="Nessun ticket in coda"
          description="Quando un cliente apre una richiesta o viene segnalato un problema, lo vedrai qui."
        />
      );
    }
    return (
      <div className="space-y-3">
        {tickets.map((ticket) => (
          <TicketCardMobile
            key={ticket.id}
            ticket={ticket}
            onClick={() => onTicketClick(ticket)}
            onTakeOwnership={onTakeOwnership ? (e) => onTakeOwnership(ticket, e) : undefined}
            isSlaBreached={showSlaIndicator && isSlaBreached(ticket, slaThresholds)}
          />
        ))}
      </div>
    );
  }

  return (
    <>
    <div className="rounded-md border overflow-x-auto">
      <Table data-testid="tickets-table" className="min-w-[800px]">
        <TableHeader>
          <TableRow>
            {showCheckboxes && (
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Seleziona tutti"
                  className={cn(someSelected && "opacity-50")}
                />
              </TableHead>
            )}
            <TableHead className="w-[90px]">Stato</TableHead>
            <TableHead className="w-[50px]">
              <span className="inline-flex items-center">P.<FieldHelp text="Priorità AI: calcolata su urgenza richiesta, valore deal collegato e SLA residuo. Modificabile manualmente." /></span>
            </TableHead>
            <TableHead className="min-w-[120px]">Contatto</TableHead>
            <TableHead className="min-w-[150px]">Titolo</TableHead>
            <TableHead className="w-[100px]">Categoria</TableHead>
            <TableHead className="min-w-[120px]">Assegnato</TableHead>
            <TableHead className="w-[110px]">
              <span className="inline-flex items-center">Aging<FieldHelp text="Tempo trascorso dall'apertura. Badge SLA rosso = ticket oltre soglia di risposta per la sua priorità." /></span>
            </TableHead>
            {onTakeOwnership && <TableHead className="w-[80px]">Azione</TableHead>}
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="p-0">
                <EmptyState
                  icon={TicketIcon}
                  title="Nessun ticket in coda"
                  description="Quando un cliente apre una richiesta o viene segnalato un problema, lo vedrai qui."
                />
              </TableCell>
            </TableRow>
          ) : (
            tickets.map((ticket) => (
              <TableRow
                key={ticket.id}
                data-testid="ticket-row"
                data-ticket-id={ticket.id}
                className={cn(
                  "cursor-pointer hover:bg-muted/50",
                  selectedIds.has(ticket.id) && "bg-muted/30"
                )}
                onClick={() => onTicketClick(ticket)}
              >
                {showCheckboxes && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(ticket.id)}
                      onCheckedChange={(checked) => handleSelectOne(ticket.id, !!checked)}
                      aria-label={`Seleziona ticket ${ticket.title}`}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <TicketStatusBadge status={ticket.status} />
                </TableCell>
                <TableCell>
                  <TicketPriorityBadge priority={ticket.priority} />
                </TableCell>
                <TableCell className="font-medium">
                  {getContactName(ticket)}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {ticket.title}
                </TableCell>
                <TableCell>
                  {ticket.tags ? (
                    <Badge 
                      variant="outline"
                      style={{ 
                        borderColor: ticket.tags.color || undefined,
                        color: ticket.tags.color || undefined 
                      }}
                    >
                      {ticket.tags.name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {ticket.users ? (
                      <>
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">
                          {ticket.users.full_name || ticket.users.email}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">Non assegnato</span>
                    )}
                    {/* Auto-assigned badge: assigned_at exists but assigned_by_user_id is null */}
                    {ticket.assigned_at && !ticket.assigned_by_user_id && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                        Auto
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className={cn(
                    "flex items-center gap-1.5",
                    // Use sla_breached_at as source of truth, fallback to dynamic check
                    (ticket.sla_breached_at || (showSlaIndicator && isSlaBreached(ticket, slaThresholds))) && "text-destructive"
                  )}>
                    {/* SLA Breach badge with tooltip */}
                    {ticket.sla_breached_at ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="destructive" 
                              className="h-5 px-1.5 text-xs font-semibold gap-1"
                              data-testid="sla-badge"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              SLA
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Scaduto SLA alle {format(new Date(ticket.sla_breached_at), "HH:mm dd/MM", { locale: it })}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : showSlaIndicator && isSlaBreached(ticket, slaThresholds) ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Oltre soglia SLA (non ancora marcato)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-sm">{getAging(ticket.opened_at)}</span>
                  </div>
                </TableCell>
                {onTakeOwnership && (
                  <TableCell>
                    {!ticket.assigned_to_user_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => onTakeOwnership(ticket, e)}
                      >
                        <Hand className="h-3.5 w-3.5 mr-1" />
                        Prendi
                      </Button>
                    )}
                  </TableCell>
                )}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {/* Take ownership */}
                      {!ticket.assigned_to_user_id && currentOperator && (
                        <DropdownMenuItem onClick={(e) => handleTakeOwnershipInternal(ticket.id, e as unknown as React.MouseEvent)}>
                          <Hand className="h-4 w-4 mr-2" />
                          Prendi in carico
                        </DropdownMenuItem>
                      )}
                      
                      {/* Assign to */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Assegna a
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => handleAssign(ticket.id, null)}>
                              <span className="text-muted-foreground">Non assegnato</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {operators.map((op) => (
                              <DropdownMenuItem 
                                key={op.user_id} 
                                onClick={() => handleAssign(ticket.id, op.user_id)}
                              >
                                {ticket.assigned_to_user_id === op.user_id && (
                                  <Circle className="h-2 w-2 mr-2 fill-current" />
                                )}
                                {op.full_name || op.email}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                      
                      {/* Status */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <ChevronRight className="h-4 w-4 mr-2" />
                          Stato
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            {statusOptions.map((opt) => (
                              <DropdownMenuItem 
                                key={opt.value} 
                                onClick={() => handleStatusChange(ticket.id, opt.value)}
                              >
                                {ticket.status === opt.value && (
                                  <Circle className="h-2 w-2 mr-2 fill-current" />
                                )}
                                {opt.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                      
                      {/* Priority */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Priorità
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            {priorityOptions.map((opt) => (
                              <DropdownMenuItem 
                                key={opt.value} 
                                onClick={() => handlePriorityChange(ticket.id, opt.value)}
                                className={opt.color}
                              >
                                {ticket.priority === opt.value && (
                                  <Circle className="h-2 w-2 mr-2 fill-current" />
                                )}
                                {opt.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                      
                      {/* Category */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Tag className="h-4 w-4 mr-2" />
                          Categoria
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => handleCategoryChange(ticket.id, null)}>
                              <span className="text-muted-foreground">Nessuna</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {categoryTags.map((tag) => (
                              <DropdownMenuItem 
                                key={tag.id} 
                                onClick={() => handleCategoryChange(ticket.id, tag.id)}
                              >
                                {ticket.category_tag_id === tag.id && (
                                  <Circle className="h-2 w-2 mr-2 fill-current" />
                                )}
                                <span style={{ color: tag.color }}>{tag.name}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                      
                      <DropdownMenuSeparator />
                      
                      {/* Archive */}
                      <DropdownMenuItem onClick={(e) => handleArchive(ticket.id, ticket.archived, e as unknown as React.MouseEvent)}>
                        {ticket.archived ? (
                          <>
                            <ArchiveRestore className="h-4 w-4 mr-2" />
                            Ripristina
                          </>
                        ) : (
                          <>
                            <Archive className="h-4 w-4 mr-2" />
                            Archivia
                          </>
                        )}
                      </DropdownMenuItem>
                      
                      {/* Delete */}
                      <DropdownMenuItem 
                        onClick={(e) => handleDeleteClick(ticket.id, e as unknown as React.MouseEvent)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare questo ticket?</AlertDialogTitle>
          <AlertDialogDescription>
            Questa azione è irreversibile. Il ticket e tutti i suoi dati verranno eliminati permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
