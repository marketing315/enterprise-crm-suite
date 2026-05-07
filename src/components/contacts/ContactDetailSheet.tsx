import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Phone, Mail, MapPin, Calendar, Tags, Pencil, Save, X, Trash2, Ticket, Briefcase, Shield, FileText, GitBranchPlus, History, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CallTranscriptsSection } from './CallTranscriptsSection';
import { LeadScoreBadge } from './LeadScoreBadge';
import { ContactQuizAnswersSection } from './ContactQuizAnswersSection';
import { Switch } from '@/components/ui/switch';
import { ClickToCallButton } from './ClickToCallButton';
import { CreateTicketDialog } from '@/components/tickets/CreateTicketDialog';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ContactStatusBadge } from './ContactStatusBadge';
import { CustomFieldsSection } from './CustomFieldsSection';
import { EntityTagList } from '@/components/tags/EntityTagList';
import { WebsiteTagsSection } from './WebsiteTagsSection';
import { CorrectPhoneDialog } from './CorrectPhoneDialog';
import { BrandBadge } from '@/components/layout/BrandBadge';
import { ContactCompanySection } from './ContactCompanySection';
import { ContactLeadDataSection } from './ContactLeadDataSection';
import { AuditTimeline } from '@/components/audit/AuditTimeline';
import { UnifiedCustomerTimeline } from '@/components/audit/UnifiedCustomerTimeline';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LeadEventCard } from './LeadEventCard';
import { useContact, useLeadEvents, useUpdateContact, useDeleteContact } from '@/hooks/useContacts';
import { useContactDeal, useCreateContactDeal } from '@/hooks/useContactDeal';
import { usePipelineStages } from '@/hooks/usePipeline';
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
  marketing_consent: boolean;
}

export function ContactDetailSheet({ contactId, open, onOpenChange }: ContactDetailSheetProps) {
  const navigate = useNavigate();
  const [conflictContactId, setConflictContactId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [formData, setFormData] = useState<EditFormData>({
    first_name: '',
    last_name: '',
    email: '',
    city: '',
    cap: '',
    address: '',
    notes: '',
    status: 'new',
    marketing_consent: false,
  });

  const { data: contact, isLoading: contactLoading } = useContact(contactId);
  const { data: events, isLoading: eventsLoading } = useLeadEvents(contactId || undefined);
  const { data: openDeal } = useContactDeal(contactId);
  const { data: stages } = usePipelineStages();
  const createDeal = useCreateContactDeal();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  // Initialize form data when contact loads.
  // Bug #2 (MEDIA): reset isEditing quando contact cambia per evitare di restare
  // in editing mode con dati stantii dopo aver cambiato contatto.
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
        marketing_consent: (contact as { marketing_consent?: boolean }).marketing_consent ?? false,
      });
      setIsEditing(false);
    }
  }, [contact?.id]);

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
      const updates: Record<string, any> = { ...formData };
      // Set marketing_consent_at when consent changes
      // Bug #8 (MEDIA): usare ?? false per gestire correttamente null/undefined dal DB
      const prevConsent = (contact as { marketing_consent?: boolean | null }).marketing_consent ?? false;
      if (formData.marketing_consent !== prevConsent) {
        updates.marketing_consent_at = formData.marketing_consent ? new Date().toISOString() : null;
      }
      await updateContact.mutateAsync({
        id: contact.id,
        updates,
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
        marketing_consent: (contact as any).marketing_consent || false,
      });
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!contact?.id) return;

    try {
      await deleteContact.mutateAsync(contact.id);
      toast.success('Contatto eliminato');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Errore durante l\'eliminazione');
    }
  };

  const getFullName = () => {
    if (!contact) return '';
    const parts = [contact.first_name, contact.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Senza nome';
  };

  const getInitials = () => {
    if (!contact) return '?';
    const f = (contact.first_name || '').trim();
    const l = (contact.last_name || '').trim();
    if (f || l) return ((f[0] || '') + (l[0] || '')).toUpperCase() || '?';
    return (contact.email?.[0] || '?').toUpperCase();
  };

  const STATUS_OPTIONS: { value: ContactStatus; label: string }[] = [
    { value: 'new', label: 'Nuovo' },
    { value: 'active', label: 'Attivo' },
    { value: 'qualified', label: 'Qualificato' },
    { value: 'unqualified', label: 'Non qualificato' },
    { value: 'archived', label: 'Archiviato' },
  ];

  // Reusable section card wrapper for C-level scannable layout
  const SectionCard = ({ icon: Icon, title, action, children, muted = false }: { icon?: any; title: string; action?: React.ReactNode; children: React.ReactNode; muted?: boolean }) => (
    <section className={`rounded-xl border ${muted ? 'bg-muted/30' : 'bg-card'} p-4 space-y-3`}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {title}
        </h3>
        {action}
      </header>
      <div className="space-y-2.5 text-sm">{children}</div>
    </section>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl lg:max-w-2xl overflow-hidden flex flex-col p-0">
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <SheetHeader className="flex flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-base font-semibold">Dettaglio Contatto</SheetTitle>
          {contact && !isEditing && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-1" />
                Modifica
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminare questo contatto?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Questa azione è irreversibile. Il contatto e tutti i dati associati verranno eliminati permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deleteContact.isPending}
                    >
                      Elimina
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
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
        </div>

        {contactLoading ? (
          <div className="px-5 sm:px-6 mt-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : contact ? (
          <Tabs defaultValue="details" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 sm:px-6 pt-3">
              <TabsList className="grid w-full grid-cols-3 shrink-0 h-9 bg-muted/40 rounded-lg">
                <TabsTrigger value="details" className="text-xs">Dettagli</TabsTrigger>
                <TabsTrigger value="unified" className="text-xs flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Storico
                </TabsTrigger>
                <TabsTrigger value="audit" className="text-xs flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Audit
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="details" className="flex-1 overflow-hidden mt-2 px-0">
          <ScrollArea className="h-[calc(100vh-220px)] px-5 sm:px-6">
            <div className="space-y-4 pb-6">
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

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label>Consenso Marketing</Label>
                      <p className="text-xs text-muted-foreground">
                        Abilita l'invio di eventi CAPI a Meta
                      </p>
                    </div>
                    <Switch
                      checked={formData.marketing_consent}
                      onCheckedChange={(v) => setFormData((p) => ({ ...p, marketing_consent: v }))}
                    />
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
                <div className="rounded-2xl border bg-gradient-to-br from-muted/40 to-background p-5">
                  <div className="flex items-start gap-4">
                    <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-base font-semibold text-primary shrink-0">
                      {getInitials()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-semibold leading-tight truncate">{getFullName()}</h2>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <ContactStatusBadge status={contact.status} />
                        <BrandBadge brandId={contact.brand_id} />
                        {(contact as any).marketing_consent && (
                          <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
                            <Shield className="h-3 w-3" /> Marketing
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {contactId && (
                    <div className="mt-4 pt-4 border-t border-border/60">
                      <LeadScoreBadge contactId={contactId} />
                    </div>
                  )}
                </div>
              )}

              {/* Informazioni di contatto */}
              {!isEditing && (
                <SectionCard title="Informazioni" muted>
                  {contact.contact_phones?.map((phone) => (
                    <div key={phone.id} className="flex items-center gap-2 group">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">{phone.phone_normalized}</span>
                      {phone.is_primary && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Principale</Badge>
                      )}
                      {phone.assumed_country && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{phone.country_code}</Badge>
                      )}
                      <div className="ml-auto flex items-center gap-0.5">
                        <ClickToCallButton
                          contactId={contact.id}
                          phoneNumber={phone.phone_normalized}
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-60 group-hover:opacity-100 transition-opacity"
                        />
                        <CorrectPhoneDialog
                          contactId={contact.id}
                          currentPhone={phone.phone_normalized}
                          isPrimary={phone.is_primary}
                          onConflict={handlePhoneConflict}
                        />
                      </div>
                    </div>
                  ))}

                  {contact.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{contact.email}</span>
                    </div>
                  )}

                  {(contact.city || contact.cap || (contact as any).address) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        {(contact.city || contact.cap) && (
                          <div>{[contact.city, contact.cap].filter(Boolean).join(' · ')}</div>
                        )}
                        {(contact as any).address && (
                          <div className="text-muted-foreground text-xs">
                            {[(contact as any).address, (contact as any).province, (contact as any).country].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      Creato il {(() => {
                        const leadEvents = (contact as any).lead_events as any[] | undefined;
                        const validDates = leadEvents
                          ?.map((e: any) => e.occurred_at)
                          .filter((d: any) => d && new Date(d).getFullYear() > 2000)
                          .sort() || [];
                        const displayDate = validDates.length > 0 ? validDates[0] : contact.created_at;
                        return format(new Date(displayDate), 'dd MMM yyyy · HH:mm', { locale: it });
                      })()}
                    </span>
                  </div>
                </SectionCard>
              )}

              {/* Tag CRM + Pipeline (riga compatta) */}
              {!isEditing && (
                <SectionCard icon={Tags} title="Tag e Pipeline">
                  <EntityTagList entityType="contact" entityId={contact.id} scope="contact" />
                  {openDeal?.current_stage_id && (() => {
                    const currentStage = stages?.find(s => s.id === openDeal.current_stage_id);
                    return currentStage ? (
                      <div className="flex items-center gap-2 pt-2 mt-2 border-t border-border/60">
                        <GitBranchPlus className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Fase:</span>
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: currentStage.color || 'hsl(var(--primary))' }}
                        />
                        <span className="text-xs font-medium">{currentStage.name}</span>
                      </div>
                    ) : null;
                  })()}
                </SectionCard>
              )}

              {/* Sezioni dati (Company / Lead / Quiz) */}
              {!isEditing && (
                <div className="space-y-3">
                  <ContactCompanySection contact={contact as any} />
                  <ContactLeadDataSection contact={contact as any} />
                  <ContactQuizAnswersSection quizAnswers={(contact as any)?.quiz_answers} />
                </div>
              )}

              {/* Lead Message (in evidenza se presente) */}
              {!isEditing && (contact as any).lead_message && (
                <SectionCard icon={FileText} title="Messaggio Lead" muted>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {(contact as any).lead_message}
                  </p>
                </SectionCard>
              )}

              {/* Note */}
              {!isEditing && contact.notes && (
                <SectionCard title="Note" muted>
                  <p className="whitespace-pre-wrap text-sm">{contact.notes}</p>
                </SectionCard>
              )}

              {/* Sezioni avanzate (collapsible) */}
              {!isEditing && (
                <div className="space-y-2">
                  <Collapsible>
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors group">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trascrizioni chiamate</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <CallTranscriptsSection contactId={contact.id} />
                    </CollapsibleContent>
                  </Collapsible>

                  <Collapsible>
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors group">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campi personalizzati</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <CustomFieldsSection contactId={contact.id} />
                    </CollapsibleContent>
                  </Collapsible>

                  {events && events.length > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors group">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tag sito web</span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2">
                        <WebsiteTagsSection events={events} />
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  <Collapsible>
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors group">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                        Eventi lead
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{events?.length || 0}</Badge>
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 space-y-2">
                      {eventsLoading ? (
                        <>
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                        </>
                      ) : events && events.length > 0 ? (
                        events.map((event) => (
                          <LeadEventCard key={event.id} event={event as any} />
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground px-2">Nessun evento registrato</p>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
            </div>
          </ScrollArea>
            </TabsContent>

            <TabsContent value="audit" className="flex-1 overflow-hidden mt-2">
              <ScrollArea className="h-[calc(100vh-220px)] px-5 sm:px-6">
                <AuditTimeline entityType="contact" entityId={contact.id} />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="unified" className="flex-1 overflow-hidden mt-2">
              <ScrollArea className="h-[calc(100vh-220px)] px-5 sm:px-6">
                <UnifiedCustomerTimeline contactId={contact.id} />
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <p className="mt-6 text-muted-foreground">Contatto non trovato</p>
        )}

        {/* Sticky bottom CTA bar */}
        {contact && !isEditing && (() => {
          const primaryPhone =
            contact.contact_phones?.find((p) => p.is_primary && p.is_active)?.phone_normalized ||
            contact.contact_phones?.[0]?.phone_normalized;
          return (
            <div className="shrink-0 px-5 sm:px-6 py-3 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex flex-wrap gap-2">
              {primaryPhone ? (
                <ClickToCallButton
                  contactId={contact.id}
                  phoneNumber={primaryPhone}
                  variant="default"
                  size="sm"
                  showLabel
                  className="flex-1 min-w-[110px]"
                />
              ) : (
                <Button variant="default" size="sm" className="flex-1 min-w-[110px]" disabled>
                  <Phone className="h-4 w-4 mr-1.5" /> Chiama
                </Button>
              )}
              {openDeal ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 min-w-[110px]"
                  onClick={() => { onOpenChange(false); navigate(`/pipeline?deal=${openDeal.id}`); }}
                >
                  <Briefcase className="h-4 w-4 mr-1.5" /> Apri Deal
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 min-w-[110px]"
                  disabled={createDeal.isPending}
                  onClick={async () => {
                    try {
                      const dealId = await createDeal.mutateAsync({ brandId: contact.brand_id, contactId: contact.id });
                      toast.success('Deal creato');
                      onOpenChange(false);
                      navigate(`/pipeline?deal=${dealId}`);
                    } catch (error: any) {
                      toast.error(error.message || 'Errore durante la creazione del deal');
                    }
                  }}
                >
                  <Briefcase className="h-4 w-4 mr-1.5" /> Crea Deal
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex-1 min-w-[110px]"
                onClick={() => setTicketDialogOpen(true)}
              >
                <Ticket className="h-4 w-4 mr-1.5" /> Ticket
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 min-w-[110px]"
                onClick={() => navigate(`/appointments?contactId=${contact.id}`)}
              >
                <Calendar className="h-4 w-4 mr-1.5" /> Appuntamento
              </Button>
            </div>
          );
        })()}

        {/* Create Ticket Dialog */}
        {contact && (
          <CreateTicketDialog
            open={ticketDialogOpen}
            onOpenChange={setTicketDialogOpen}
            contactId={contact.id}
            contactName={getFullName()}
            sourceContext="contact_sheet"
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
