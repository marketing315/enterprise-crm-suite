import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Phone, Mail, MapPin, Calendar, FileJson, Tags, Pencil, Save, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContactStatusBadge } from './ContactStatusBadge';
import { CustomFieldsSection } from './CustomFieldsSection';
import { EntityTagList } from '@/components/tags/EntityTagList';
import { WebsiteTagsSection } from './WebsiteTagsSection';
import { CorrectPhoneDialog } from './CorrectPhoneDialog';
import { useContact, useLeadEvents, useUpdateContact } from '@/hooks/useContacts';
import { toast } from 'sonner';
import type { ContactStatus } from '@/types/database';

interface ContactDetailSheetProps {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EditFormData {
  first_name: string;
  last_name: string;
  email: string;
  city: string;
  cap: string;
  address: string;
  notes: string;
  status: ContactStatus;
}

export function ContactDetailSheet({ contactId, open, onOpenChange }: ContactDetailSheetProps) {
  const [conflictContactId, setConflictContactId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<EditFormData>({
    first_name: '',
    last_name: '',
    email: '',
    city: '',
    cap: '',
    address: '',
    notes: '',
    status: 'new',
  });

  const { data: contact, isLoading: contactLoading } = useContact(contactId);
  const { data: events, isLoading: eventsLoading } = useLeadEvents(contactId || undefined);
  const updateContact = useUpdateContact();

  // Initialize form data when contact loads
  useEffect(() => {
    if (contact) {
      setFormData({
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        email: contact.email || '',
        city: contact.city || '',
        cap: contact.cap || '',
        address: contact.address || '',
        notes: contact.notes || '',
        status: contact.status || 'new',
      });
    }
  }, [contact]);

  // Reset editing state when sheet closes
  useEffect(() => {
    if (!open) {
      setIsEditing(false);
    }
  }, [open]);

  // Handle phone conflict navigation
  const handlePhoneConflict = (conflictId: string) => {
    setConflictContactId(conflictId);
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!contact?.id) return;

    try {
      await updateContact.mutateAsync({
        id: contact.id,
        updates: formData,
      });
      toast.success('Contatto aggiornato');
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error.message || 'Errore durante il salvataggio');
    }
  };

  const handleCancel = () => {
    if (contact) {
      setFormData({
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        email: contact.email || '',
        city: contact.city || '',
        cap: contact.cap || '',
        address: contact.address || '',
        notes: contact.notes || '',
        status: contact.status || 'new',
      });
    }
    setIsEditing(false);
  };

  const getFullName = () => {
    if (!contact) return '';
    const parts = [contact.first_name, contact.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Senza nome';
  };

  const STATUS_OPTIONS: { value: ContactStatus; label: string }[] = [
    { value: 'new', label: 'Nuovo' },
    { value: 'active', label: 'Attivo' },
    { value: 'qualified', label: 'Qualificato' },
    { value: 'unqualified', label: 'Non qualificato' },
    { value: 'archived', label: 'Archiviato' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader className="flex flex-row items-center justify-between">
          <SheetTitle>Dettaglio Contatto</SheetTitle>
          {contact && !isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" />
              Modifica
            </Button>
          )}
          {isEditing && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                Annulla
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateContact.isPending}>
                <Save className="h-4 w-4 mr-1" />
                Salva
              </Button>
            </div>
          )}
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
              {/* Header / Edit Form */}
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="first_name">Nome</Label>
                      <Input
                        id="first_name"
                        value={formData.first_name}
                        onChange={(e) => setFormData((p) => ({ ...p, first_name: e.target.value }))}
                        placeholder="Nome"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="last_name">Cognome</Label>
                      <Input
                        id="last_name"
                        value={formData.last_name}
                        onChange={(e) => setFormData((p) => ({ ...p, last_name: e.target.value }))}
                        placeholder="Cognome"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                      placeholder="email@esempio.com"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="city">Città</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
                        placeholder="Città"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cap">CAP</Label>
                      <Input
                        id="cap"
                        value={formData.cap}
                        onChange={(e) => setFormData((p) => ({ ...p, cap: e.target.value }))}
                        placeholder="00000"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="address">Indirizzo</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                      placeholder="Via, numero civico"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="status">Stato</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) => setFormData((p) => ({ ...p, status: v as ContactStatus }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona stato" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="notes">Note</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                      placeholder="Note sul contatto..."
                      rows={3}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="text-2xl font-semibold">{getFullName()}</h2>
                  <div className="mt-2">
                    <ContactStatusBadge status={contact.status} />
                  </div>
                </div>
              )}

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
