import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { it } from "date-fns/locale";
import { User, Clock, MessageSquare, Send, ExternalLink, UserPlus, History, Bot } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { TicketAuditTimeline } from "./TicketAuditTimeline";
import {
  TicketWithRelations,
  TicketStatus,
  useTicketEvents,
  useTicketComments,
  useUpdateTicketStatus,
  useAddTicketComment,
  useAssignTicket,
} from "@/hooks/useTickets";
import { useLatestTicketAudit } from "@/hooks/useTicketAuditLogs";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface TicketDetailSheetProps {
  ticket: TicketWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TicketDetailSheet({
  ticket,
  open,
  onOpenChange,
}: TicketDetailSheetProps) {
  const [newComment, setNewComment] = useState("");
  
  const { supabaseUser, hasRole } = useAuth();
  const { data: events = [] } = useTicketEvents(ticket?.id || null);
  const { data: comments = [] } = useTicketComments(ticket?.id || null);
  const { data: operators = [] } = useBrandOperators();
  const { data: latestAudit } = useLatestTicketAudit(ticket?.id || null);
  const updateStatus = useUpdateTicketStatus();
  const addComment = useAddTicketComment();
  const assignTicket = useAssignTicket();

  if (!ticket) return null;

  // Check if user can assign tickets (callcenter can also reassign to other operators)
  const canAssign = hasRole('admin') || hasRole('callcenter');
  const currentOperator = operators.find((op) => op.supabase_auth_id === supabaseUser?.id);

  const handleStatusChange = async (status: TicketStatus) => {
    try {
      await updateStatus.mutateAsync({ ticketId: ticket.id, status });
      toast.success("Stato aggiornato");
    } catch {
      toast.error("Errore nell'aggiornamento");
    }
  };

  const handleAssignChange = async (userId: string) => {
    try {
      await assignTicket.mutateAsync({ 
        ticketId: ticket.id, 
        userId: userId === "unassigned" ? null : userId 
      });
      toast.success("Ticket assegnato");
    } catch {
      toast.error("Errore nell'assegnazione");
    }
  };

  const handleTakeOwnership = async () => {
    if (!currentOperator) return;
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

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      await addComment.mutateAsync({ ticketId: ticket.id, body: newComment });
      setNewComment("");
      toast.success("Commento aggiunto");
    } catch {
      toast.error("Errore nell'aggiunta del commento");
    }
  };

  const getContactName = () => {
    if (!ticket.contacts) return "—";
    const { first_name, last_name, email } = ticket.contacts;
    if (first_name || last_name) {
      return `${first_name || ""} ${last_name || ""}`.trim();
    }
    return email || "—";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-[500px] sm:max-w-[600px] flex flex-col p-4 sm:p-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg">
            <span className="truncate">{ticket.title}</span>
            <TicketPriorityBadge priority={ticket.priority} />
          </SheetTitle>
          {/* Last updated badge */}
          {latestAudit && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <History className="h-3 w-3" />
              <span>
                Ultimo aggiornamento: {" "}
                {latestAudit.users ? (
                  <span className="font-medium text-foreground">
                    {latestAudit.users.full_name || latestAudit.users.email}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <Bot className="h-3 w-3" /> Sistema
                  </span>
                )}
                {" · "}
                {formatDistanceToNow(new Date(latestAudit.created_at), { locale: it, addSuffix: true })}
              </span>
            </div>
          )}
        </SheetHeader>

        <Tabs defaultValue="details" className="flex-1 flex flex-col overflow-hidden mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Dettagli</TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <History className="h-3.5 w-3.5" />
              Audit
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-full -mx-6 px-6">
              <div className="space-y-6 pb-4">
                {/* Status & Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Stato:</span>
                    <TicketStatusBadge status={ticket.status} />
                  </div>
                  <Select
                    value={ticket.status}
                    onValueChange={(v) => handleStatusChange(v as TicketStatus)}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Aperto</SelectItem>
                      <SelectItem value="in_progress">In Lavorazione</SelectItem>
                      <SelectItem value="resolved">Risolto</SelectItem>
                      <SelectItem value="closed">Chiuso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Assignment */}
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      Assegnazione
                    </h4>
                    {!ticket.assigned_to_user_id && currentOperator && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleTakeOwnership}
                        disabled={assignTicket.isPending}
                      >
                        Prendi in carico
                      </Button>
                    )}
                  </div>
                  
                  {canAssign ? (
                    <Select
                      value={ticket.assigned_to_user_id || "unassigned"}
                      onValueChange={handleAssignChange}
                      disabled={assignTicket.isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona operatore" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Non assegnato</SelectItem>
                        {operators.map((op) => (
                          <SelectItem key={op.user_id} value={op.user_id}>
                            {op.full_name || op.email}
                            <span className="text-xs text-muted-foreground ml-2">
                              ({op.role})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-sm">
                      {ticket.users ? (
                        <span>{ticket.users.full_name || ticket.users.email}</span>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          Non assegnato
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Assignment details */}
                  {ticket.assigned_at && (
                    <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <span>Assegnato da:</span>
                        {ticket.assigned_by_user_id ? (
                          <span className="font-medium text-foreground">
                            {ticket.assigned_by?.full_name || ticket.assigned_by?.email || "—"}
                          </span>
                        ) : (
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                            Auto (Round Robin)
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Assegnato il:</span>
                        <span className="font-medium text-foreground">
                          {format(new Date(ticket.assigned_at), "dd/MM/yyyy HH:mm", { locale: it })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Contact Info */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Contatto
                    </h4>
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Apri
                    </Button>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="font-medium">{getContactName()}</p>
                    {ticket.contacts?.email && (
                      <p className="text-muted-foreground">{ticket.contacts.email}</p>
                    )}
                  </div>
                </div>

                {/* Category & Metadata */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Categoria:</span>
                    {ticket.tags ? (
                      <Badge
                        variant="outline"
                        className="ml-2"
                        style={{
                          borderColor: ticket.tags.color || undefined,
                          color: ticket.tags.color || undefined,
                        }}
                      >
                        {ticket.tags.name}
                      </Badge>
                    ) : (
                      <span className="ml-2 text-muted-foreground">—</span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Creato da:</span>
                    <Badge variant="secondary" className="ml-2">
                      {ticket.created_by === "ai" ? "AI" : ticket.created_by === "user" ? "Utente" : "Regola"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Aperto:</span>
                    <span>{formatDistanceToNow(new Date(ticket.opened_at), { locale: it, addSuffix: true })}</span>
                  </div>
                </div>

                {/* Description */}
                {ticket.description && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Descrizione</h4>
                      <p className="text-sm text-muted-foreground">{ticket.description}</p>
                    </div>
                  </>
                )}

                {/* Timeline */}
                <Separator />
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Timeline Eventi ({events.length})
                  </h4>
                  <div className="space-y-3">
                    {events.map((event) => (
                      <div key={event.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">
                            {event.lead_events?.source_name || "Evento"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(event.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                          </span>
                        </div>
                        {event.note && (
                          <p className="text-muted-foreground">{event.note}</p>
                        )}
                        {event.lead_events?.raw_payload && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer">
                              Payload
                            </summary>
                            <pre className="text-xs mt-1 p-2 bg-muted rounded overflow-auto max-h-32">
                              {JSON.stringify(event.lead_events.raw_payload, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                    {events.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nessun evento collegato</p>
                    )}
                  </div>
                </div>

                {/* Comments */}
                <Separator />
                <div>
                  <h4 className="font-medium mb-3">Commenti Interni ({comments.length})</h4>
                  <div className="space-y-3 mb-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="rounded-lg bg-muted p-3 text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">
                            {comment.users?.full_name || comment.users?.email || "Utente"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(comment.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                          </span>
                        </div>
                        <p>{comment.body}</p>
                      </div>
                    ))}
                  </div>

                  {/* Add Comment */}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Aggiungi un commento..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="min-h-[60px]"
                    />
                    <Button
                      size="icon"
                      onClick={handleAddComment}
                      disabled={!newComment.trim() || addComment.isPending}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="audit" className="flex-1 overflow-hidden mt-4">
            <div className="h-full">
              <TicketAuditTimeline ticketId={ticket.id} />
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
