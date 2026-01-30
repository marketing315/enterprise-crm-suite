import { useState } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Phone, Mail, MapPin, Calendar, FileJson, Tags } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContactStatusBadge } from './ContactStatusBadge';
import { CustomFieldsSection } from './CustomFieldsSection';
import { EntityTagList } from '@/components/tags/EntityTagList';
import { WebsiteTagsSection } from './WebsiteTagsSection';
import { CorrectPhoneDialog } from './CorrectPhoneDialog';
import { useContact, useLeadEvents } from '@/hooks/useContacts';

interface ContactDetailSheetProps {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactDetailSheet({ contactId, open, onOpenChange }: ContactDetailSheetProps) {
  const [conflictContactId, setConflictContactId] = useState<string | null>(null);
  const { data: contact, isLoading: contactLoading } = useContact(contactId);
  const { data: events, isLoading: eventsLoading } = useLeadEvents(contactId || undefined);

  // Handle phone conflict navigation
  const handlePhoneConflict = (conflictId: string) => {
    setConflictContactId(conflictId);
    // Could navigate to conflicting contact or show merge UI
    // For now, just close and the parent can handle navigation
    onOpenChange(false);
    // Parent component can listen to this via a callback if needed
  };

  const getFullName = () => {
    if (!contact) return '';
    const parts = [contact.first_name, contact.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Senza nome';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Dettaglio Contatto</SheetTitle>
        </SheetHeader>

        {contactLoading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : contact ? (
          <ScrollArea className="h-[calc(100vh-120px)] mt-6 pr-4">
            <div className="space-y-6">
              {/* Header */}
              <div>
                <h2 className="text-2xl font-semibold">{getFullName()}</h2>
                <div className="mt-2">
                  <ContactStatusBadge status={contact.status} />
                </div>
              </div>

              <Separator />

              {/* Contact Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Informazioni</h3>
                
                {contact.contact_phones?.map((phone) => (
                  <div key={phone.id} className="flex items-center gap-2 group">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{phone.phone_normalized}</span>
                    {phone.is_primary && (
                      <Badge variant="secondary" className="text-xs">Principale</Badge>
                    )}
                    {phone.assumed_country && (
                      <Badge variant="outline" className="text-xs">{phone.country_code} (assunto)</Badge>
                    )}
                    <CorrectPhoneDialog
                      contactId={contact.id}
                      currentPhone={phone.phone_normalized}
                      isPrimary={phone.is_primary}
                      onConflict={handlePhoneConflict}
                    />
                  </div>
                ))}

                {contact.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.email}</span>
                  </div>
                )}

                {(contact.city || contact.cap) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {[contact.city, contact.cap].filter(Boolean).join(' - ')}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Creato il {format(new Date(contact.created_at), 'dd MMMM yyyy HH:mm', { locale: it })}
                  </span>
                </div>
              </div>

              {/* CRM Tags */}
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Tags className="h-4 w-4" />
                  Tag CRM
                </h3>
                <EntityTagList 
                  entityType="contact" 
                  entityId={contact.id} 
                  scope="contact"
                />
              </div>

              {/* Custom Fields */}
              <Separator />
              <CustomFieldsSection contactId={contact.id} />

              {/* Website Tags (from webhooks) */}
              {events && events.length > 0 && (
                <>
                  <Separator />
                  <WebsiteTagsSection events={events} />
                </>
              )}

              {contact.notes && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Note</h3>
                    <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
                  </div>
                </>
              )}

              <Separator />

              {/* Lead Events */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Eventi Lead ({events?.length || 0})
                </h3>

                {eventsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : events && events.length > 0 ? (
                  <div className="space-y-3">
                    {events.map((event) => (
                      <div 
                        key={event.id} 
                        className="rounded-lg border p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">{event.source}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(event.received_at), 'dd/MM/yyyy HH:mm', { locale: it })}
                          </span>
                        </div>
                        
                        {event.source_name && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Sorgente:</span> {event.source_name}
                          </p>
                        )}

                        {event.ai_priority !== null && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Priorità AI:</span> {event.ai_priority}
                          </p>
                        )}

                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
                            <FileJson className="h-3 w-3" />
                            Payload raw
                          </summary>
                          <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                            {JSON.stringify(event.raw_payload, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nessun evento registrato</p>
                )}
              </div>
            </div>
          </ScrollArea>
        ) : (
          <p className="mt-6 text-muted-foreground">Contatto non trovato</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
