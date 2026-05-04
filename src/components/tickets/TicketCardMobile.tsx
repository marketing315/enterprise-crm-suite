import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { Phone, AlertTriangle, UserPlus, MoreVertical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { ClickToCallButton } from "@/components/contacts/ClickToCallButton";
import type { TicketWithRelations } from "@/hooks/useTickets";

interface TicketCardMobileProps {
  ticket: TicketWithRelations;
  onClick: () => void;
  onTakeOwnership?: (e: React.MouseEvent) => void;
  showSlaBadge?: boolean;
  isSlaBreached?: boolean;
}

function getContactName(ticket: TicketWithRelations) {
  if (!ticket.contacts) return null;
  const { first_name, last_name, email } = ticket.contacts;
  if (first_name || last_name) {
    return `${first_name || ""} ${last_name || ""}`.trim();
  }
  return email;
}

function getPrimaryPhone(ticket: TicketWithRelations): string | null {
  const phones = ticket.contacts?.contact_phones;
  if (!phones || phones.length === 0) return null;
  const primary = phones.find((p) => p.is_primary);
  return primary?.phone_raw || phones[0]?.phone_raw || null;
}

/**
 * Card mobile per la lista Ticket (<768px).
 * Mostra titolo, badge stato/priorità, contatto con click-to-call,
 * categoria, aging e bottone "Prendi in carico".
 */
export function TicketCardMobile({
  ticket,
  onClick,
  onTakeOwnership,
  isSlaBreached,
}: TicketCardMobileProps) {
  const contactName = getContactName(ticket);
  const phone = getPrimaryPhone(ticket);
  const aging = formatDistanceToNow(new Date(ticket.opened_at), { locale: it, addSuffix: false });

  return (
    <Card
      className="p-4 active:bg-muted/40 transition-colors"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
            {(ticket.sla_breached_at || isSlaBreached) && (
              <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
                <AlertTriangle className="h-3 w-3" /> SLA
              </span>
            )}
          </div>
          <h3 className="font-semibold text-base leading-snug">{ticket.title}</h3>
          {ticket.tags && (
            <span
              className="inline-block text-xs px-2 py-0.5 rounded border"
              style={{
                borderColor: ticket.tags.color || undefined,
                color: ticket.tags.color || undefined,
              }}
            >
              {ticket.tags.name}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 -mt-1" tabIndex={-1}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 space-y-2 text-sm">
        {contactName && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground truncate">{contactName}</span>
            {phone && (
              <div onClick={(e) => e.stopPropagation()}>
                <ClickToCallButton
                  contactId={ticket.contacts!.id}
                  phoneNumber={phone}
                  size="sm"
                  variant="outline"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Aperto da {aging}</span>
          {ticket.users ? (
            <span className="truncate max-w-[40%]">
              {ticket.users.full_name || ticket.users.email}
            </span>
          ) : (
            <span className="text-amber-600 font-medium">Non assegnato</span>
          )}
        </div>

        {!ticket.assigned_to_user_id && onTakeOwnership && (
          <Button
            variant="default"
            size="sm"
            className="w-full mt-2"
            onClick={(e) => {
              e.stopPropagation();
              onTakeOwnership(e);
            }}
          >
            <UserPlus className="h-4 w-4 mr-2" /> Prendi in carico
          </Button>
        )}

        {!contactName && phone && (
          <a
            href={`tel:${phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 text-primary text-sm"
          >
            <Phone className="h-4 w-4" /> {phone}
          </a>
        )}
      </div>
    </Card>
  );
}
