import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Mail, MapPin, Calendar as CalendarIcon, MoreVertical, Trash2, Eye } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContactStatusBadge } from './ContactStatusBadge';
import { ClickToCallButton } from './ClickToCallButton';
import type { ContactWithPhones } from '@/types/database';

interface ContactCardMobileProps {
  contact: ContactWithPhones & { brand_name?: string };
  onOpen: () => void;
  onDelete?: () => void;
  showBrand?: boolean;
}

function getFullName(c: ContactWithPhones) {
  const parts = [c.first_name, c.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Senza nome';
}

function getPrimaryPhone(c: ContactWithPhones): string | null {
  const primary = c.contact_phones?.find((p) => p.is_primary && p.is_active);
  return primary?.phone_normalized || c.contact_phones?.[0]?.phone_normalized || null;
}

/**
 * Card mobile per la lista Contatti (<768px).
 * Telefono cliccabile (tel:) + ClickToCallButton prominente.
 * Tap sulla card apre il dettaglio.
 */
export function ContactCardMobile({ contact, onOpen, onDelete, showBrand }: ContactCardMobileProps) {
  const phone = getPrimaryPhone(contact);
  const name = getFullName(contact);

  return (
    <Card
      className="p-4 active:bg-muted/40 transition-colors"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base truncate">{name}</h3>
            <ContactStatusBadge status={contact.status} />
          </div>
          {showBrand && contact.brand_name && (
            <p className="text-xs text-muted-foreground mt-0.5">{contact.brand_name}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Altre azioni">
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onOpen}>
              <Eye className="h-4 w-4 mr-2" /> Vedi dettaglio
            </DropdownMenuItem>
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Elimina
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        {phone ? (
          <div
            className="flex items-center justify-between gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <a
              href={`tel:${phone}`}
              className="text-primary font-medium hover:underline"
            >
              {phone}
            </a>
            <ClickToCallButton
              contactId={contact.id}
              phoneNumber={phone}
              size="sm"
              variant="default"
              showLabel
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">Nessun telefono</p>
        )}

        {contact.email && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{contact.email}</span>
          </div>
        )}

        {(contact.city || contact.cap) && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {contact.city}
              {contact.cap && ` (${contact.cap})`}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 text-muted-foreground text-xs pt-1">
          <CalendarIcon className="h-3 w-3 shrink-0" />
          <span>{format(new Date(contact.created_at), 'dd MMM yyyy', { locale: it })}</span>
        </div>
      </div>
    </Card>
  );
}
