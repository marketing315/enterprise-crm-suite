import { useState, useEffect } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Search, Plus, ChevronDown, ChevronLeft, ChevronRight, User, Phone, Mail } from "lucide-react";
import { useCreateAppointment } from "@/hooks/useAppointments";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { useContactSearch } from "@/hooks/useContactSearch";
import { useLeadEvents } from "@/hooks/useContacts";
import { useSetLeadEventClinicalTopics } from "@/hooks/useClinicalTopics";
import { useCreateManualLeadEvent, useUpdateLeadEventQualification } from "@/hooks/useLeadEventMutations";
import { useBrand } from "@/contexts/BrandContext";
import { cn } from "@/lib/utils";
import { LeadQualificationFields } from "./LeadQualificationFields";
import type {
  LeadSourceChannel,
  ContactChannel,
  PacemakerStatus,
  CustomerSentiment,
  DecisionStatus,
  ObjectionType,
  AppointmentType,
} from "@/types/database";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface NewAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedContactId?: string;
  preselectedDealId?: string;
}

const STEPS = [
  { key: "contact", label: "Contatto", description: "Seleziona il contatto" },
  { key: "details", label: "Dettagli", description: "Data, luogo e venditore" },
  { key: "qualification", label: "Qualificazione", description: "Informazioni aggiuntive" },
] as const;

export function NewAppointmentDialog({
  open,
  onOpenChange,
  preselectedContactId,
  preselectedDealId,
}: NewAppointmentDialogProps) {
  const { currentBrand } = useBrand();
  const [step, setStep] = useState(0);

  // Contact selection
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    preselectedContactId || null
  );
  const [selectedContactName, setSelectedContactName] = useState("");

  // Lead event selection
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Appointment fields
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [appointmentType, setAppointmentType] = useState<AppointmentType>("primo_appuntamento");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [cap, setCap] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedSalesUserId, setAssignedSalesUserId] = useState<string>("");

  // Qualification fields
  const [leadSourceChannel, setLeadSourceChannel] = useState<LeadSourceChannel | null>(null);
  const [contactChannel, setContactChannel] = useState<ContactChannel | null>(null);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [pacemakerStatus, setPacemakerStatus] = useState<PacemakerStatus | null>(null);
  const [customerSentiment, setCustomerSentiment] = useState<CustomerSentiment | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<DecisionStatus | null>(null);
  const [objectionType, setObjectionType] = useState<ObjectionType | null>(null);
  const [logisticsNotes, setLogisticsNotes] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");

  const createAppointment = useCreateAppointment();
  const setEventTopics = useSetLeadEventClinicalTopics();
  const createManualEvent = useCreateManualLeadEvent();
  const updateEventQualification = useUpdateLeadEventQualification();
  const { data: operators } = useBrandOperators();
  const salesUsers = operators?.filter((op) => op.role === "sales") || [];

  const { data: contacts, isLoading: searchLoading } = useContactSearch(contactSearch);
  const { data: contactEvents } = useLeadEvents(selectedContactId || undefined);

  // Auto-select latest event when contact changes
  useEffect(() => {
    if (contactEvents && contactEvents.length > 0) {
      setSelectedEventId(contactEvents[0].id);
    } else {
      setSelectedEventId(null);
    }
  }, [contactEvents]);

  // Reset step on open
  useEffect(() => {
    if (open) {
      setStep(preselectedContactId ? 1 : 0);
    }
  }, [open, preselectedContactId]);

  const canProceedStep0 = !!selectedContactId;
  const canProceedStep1 = !!selectedDate;
  const canSubmit = canProceedStep0 && canProceedStep1;

  const handleSubmit = async () => {
    if (!selectedContactId || !selectedDate) {
      toast.error("Seleziona un contatto e una data");
      return;
    }

    const [hours, minutes] = time.split(":").map(Number);
    const scheduledAt = new Date(selectedDate);
    scheduledAt.setHours(hours, minutes, 0, 0);

    try {
      let eventId = selectedEventId;

      if (!eventId) {
        eventId = await createManualEvent.mutateAsync({
          contactId: selectedContactId,
          sourceName: "Appuntamento manuale",
          leadSourceChannel,
          contactChannel,
          pacemakerStatus,
          customerSentiment,
          decisionStatus,
          objectionType,
          bookingNotes: bookingNotes || null,
          logisticsNotes: logisticsNotes || null,
        });
      } else {
        await updateEventQualification.mutateAsync({
          eventId,
          leadSourceChannel,
          contactChannel,
          pacemakerStatus,
          customerSentiment,
          decisionStatus,
          objectionType,
          bookingNotes: bookingNotes || null,
          logisticsNotes: logisticsNotes || null,
        });
      }

      if (eventId && selectedTopicIds.length > 0) {
        await setEventTopics.mutateAsync({
          eventId,
          topicIds: selectedTopicIds,
        });
      }

      await createAppointment.mutateAsync({
        contactId: selectedContactId,
        dealId: preselectedDealId,
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: parseInt(duration, 10),
        address: address || undefined,
        city: city || undefined,
        cap: cap || undefined,
        notes: notes || undefined,
        assignedSalesUserId: assignedSalesUserId || undefined,
      });

      toast.success("Appuntamento creato!");
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error creating appointment:", error);
      toast.error("Errore nella creazione dell'appuntamento");
    }
  };

  const resetForm = () => {
    setStep(0);
    setContactSearch("");
    setSelectedContactId(preselectedContactId || null);
    setSelectedContactName("");
    setSelectedEventId(null);
    setSelectedDate(undefined);
    setTime("10:00");
    setDuration("60");
    setAppointmentType("primo_appuntamento");
    setAddress("");
    setCity("");
    setCap("");
    setNotes("");
    setAssignedSalesUserId("");
    setLeadSourceChannel(null);
    setContactChannel(null);
    setSelectedTopicIds([]);
    setPacemakerStatus(null);
    setCustomerSentiment(null);
    setDecisionStatus(null);
    setObjectionType(null);
    setLogisticsNotes("");
    setBookingNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden backdrop-blur-sm bg-background/95">
        {/* Header with step indicator */}
        <div className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="text-lg font-semibold mb-4">Nuovo Appuntamento</DialogTitle>

          {/* Step progress */}
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center flex-1">
                <button
                  onClick={() => {
                    if (i === 0 || (i === 1 && canProceedStep0) || (i === 2 && canProceedStep1)) {
                      setStep(i);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg transition-all duration-200 text-left",
                    step === i
                      ? "bg-primary/10"
                      : i < step
                      ? "opacity-70 hover:opacity-100"
                      : "opacity-40"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium shrink-0 transition-all",
                      step === i
                        ? "bg-primary text-primary-foreground"
                        : i < step
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="text-xs font-medium truncate">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={cn("w-4 h-px mx-0.5 shrink-0", i < step ? "bg-primary/30" : "bg-border")} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <ScrollArea className="flex-1 px-6">
          <div className="py-4">
            {/* Step 0: Contact */}
            {step === 0 && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <p className="text-sm text-muted-foreground mb-3">{STEPS[0].description}</p>
                </div>

                {selectedContactId ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedContactName || "Contatto selezionato"}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-lg text-xs"
                      onClick={() => {
                        setSelectedContactId(null);
                        setSelectedContactName("");
                      }}
                    >
                      Cambia
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Cerca per nome, telefono, email..."
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        className="pl-9 rounded-xl"
                        autoFocus
                      />
                    </div>
                    {contactSearch.length >= 2 && (
                      <div className="max-h-48 overflow-y-auto rounded-xl border divide-y">
                        {searchLoading ? (
                          <p className="p-3 text-sm text-muted-foreground">Caricamento...</p>
                        ) : contacts && contacts.length > 0 ? (
                          contacts.map((contact) => (
                            <button
                              key={contact.id}
                              className="w-full flex items-center gap-3 p-3 hover:bg-accent/50 transition-colors text-left"
                              onClick={() => {
                                setSelectedContactId(contact.id);
                                setSelectedContactName(
                                  [contact.first_name, contact.last_name].filter(Boolean).join(" ")
                                );
                                setContactSearch("");
                              }}
                            >
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <span className="text-xs font-medium">
                                  {(contact.first_name?.[0] || "").toUpperCase()}
                                  {(contact.last_name?.[0] || "").toUpperCase()}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {contact.first_name} {contact.last_name}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {contact.primary_phone && (
                                    <span className="flex items-center gap-0.5">
                                      <Phone className="h-2.5 w-2.5" />
                                      {contact.primary_phone}
                                    </span>
                                  )}
                                  {contact.email && (
                                    <span className="flex items-center gap-0.5">
                                      <Mail className="h-2.5 w-2.5" />
                                      {contact.email}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))
                        ) : (
                          <p className="p-3 text-sm text-muted-foreground">Nessun contatto trovato</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Lead Event Selection */}
                {selectedContactId && contactEvents && contactEvents.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Evento associato</Label>
                    <Select
                      value={selectedEventId || "_new"}
                      onValueChange={(v) => setSelectedEventId(v === "_new" ? null : v)}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Seleziona evento..." />
                      </SelectTrigger>
                      <SelectContent>
                        {contactEvents.map((event) => (
                          <SelectItem key={event.id} value={event.id}>
                            {format(new Date(event.received_at), "dd/MM/yyyy HH:mm", { locale: it })} - {event.source_name || event.source}
                          </SelectItem>
                        ))}
                        <SelectItem value="_new">
                          <span className="flex items-center gap-1">
                            <Plus className="h-3 w-3" /> Crea nuovo evento
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Step 1: Details */}
            {step === 1 && (
              <div className="space-y-4 animate-fade-in">
                <p className="text-sm text-muted-foreground mb-1">{STEPS[1].description}</p>

                {/* Date and Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Data *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal rounded-xl",
                            !selectedDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate
                            ? format(selectedDate, "d MMM yyyy", { locale: it })
                            : "Seleziona"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          initialFocus
                          className="p-3 pointer-events-auto"
                          locale={it}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Ora *</Label>
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                </div>

                {/* Duration and Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Durata</Label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 minuti</SelectItem>
                        <SelectItem value="60">1 ora</SelectItem>
                        <SelectItem value="90">1h 30min</SelectItem>
                        <SelectItem value="120">2 ore</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={appointmentType}
                      onValueChange={(v) => setAppointmentType(v as AppointmentType)}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primo_appuntamento">Primo appuntamento</SelectItem>
                        <SelectItem value="follow_up">Follow-up</SelectItem>
                        <SelectItem value="visita_tecnica">Visita tecnica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Address */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs">Indirizzo</Label>
                    <Input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Via/Piazza..."
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CAP</Label>
                    <Input
                      value={cap}
                      onChange={(e) => setCap(e.target.value)}
                      placeholder="00000"
                      className="rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Città</Label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Città"
                    className="rounded-xl"
                  />
                </div>

                {/* Assign Sales */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Venditore</Label>
                  <Select
                    value={assignedSalesUserId || "_none"}
                    onValueChange={(val) => setAssignedSalesUserId(val === "_none" ? "" : val)}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Seleziona venditore (opzionale)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nessuno</SelectItem>
                      {salesUsers.map((user) => (
                        <SelectItem key={user.user_id} value={user.user_id}>
                          {user.full_name || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Note</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Note sull'appuntamento..."
                    rows={2}
                    className="rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Qualification */}
            {step === 2 && (
              <div className="animate-fade-in">
                <p className="text-sm text-muted-foreground mb-3">{STEPS[2].description}</p>
                <LeadQualificationFields
                  leadSourceChannel={leadSourceChannel}
                  onLeadSourceChannelChange={setLeadSourceChannel}
                  contactChannel={contactChannel}
                  onContactChannelChange={setContactChannel}
                  selectedTopicIds={selectedTopicIds}
                  onTopicIdsChange={setSelectedTopicIds}
                  pacemakerStatus={pacemakerStatus}
                  onPacemakerStatusChange={setPacemakerStatus}
                  customerSentiment={customerSentiment}
                  onCustomerSentimentChange={setCustomerSentiment}
                  decisionStatus={decisionStatus}
                  onDecisionStatusChange={setDecisionStatus}
                  objectionType={objectionType}
                  onObjectionTypeChange={setObjectionType}
                  logisticsNotes={logisticsNotes}
                  onLogisticsNotesChange={setLogisticsNotes}
                  bookingNotes={bookingNotes}
                  onBookingNotesChange={setBookingNotes}
                />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer with navigation */}
        <div className="px-6 py-4 border-t border-border/50 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {step + 1} / {STEPS.length}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setStep(step - 1)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Indietro
              </Button>
            )}
            {step === 0 && (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                size="sm"
                className="rounded-xl"
                onClick={() => setStep(step + 1)}
                disabled={step === 0 ? !canProceedStep0 : step === 1 ? !canProceedStep1 : false}
              >
                Avanti
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button
                size="sm"
                className="rounded-xl"
                onClick={handleSubmit}
                disabled={!canSubmit || createAppointment.isPending}
              >
                {createAppointment.isPending ? "Creazione..." : "Crea Appuntamento"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
