import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Search } from "lucide-react";
import { useCreateAppointment } from "@/hooks/useAppointments";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { useContactSearch } from "@/hooks/useContactSearch";
import { cn } from "@/lib/utils";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { toast } from "sonner";

interface NewAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedContactId?: string;
  preselectedDealId?: string;
}

export function NewAppointmentDialog({
  open,
  onOpenChange,
  preselectedContactId,
  preselectedDealId,
}: NewAppointmentDialogProps) {
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    preselectedContactId || null
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [cap, setCap] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedSalesUserId, setAssignedSalesUserId] = useState<string>("");

  const createAppointment = useCreateAppointment();
  const { data: operators } = useBrandOperators();
  const salesUsers = operators?.filter((op) => op.role === "sales") || [];

  const { data: contacts, isLoading: searchLoading } = useContactSearch(contactSearch);

  const handleSubmit = async () => {
    if (!selectedContactId || !selectedDate) {
      toast.error("Seleziona un contatto e una data");
      return;
    }

    // Combine date and time
    const [hours, minutes] = time.split(":").map(Number);
    const scheduledAt = new Date(selectedDate);
    scheduledAt.setHours(hours, minutes, 0, 0);

    try {
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
      toast.error("Errore nella creazione dell'appuntamento");
    }
  };

  const resetForm = () => {
    setContactSearch("");
    setSelectedContactId(preselectedContactId || null);
    setSelectedDate(undefined);
    setTime("10:00");
    setDuration("60");
    setAddress("");
    setCity("");
    setCap("");
    setNotes("");
    setAssignedSalesUserId("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nuovo Appuntamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Contact Search */}
          <div className="space-y-2">
            <Label>Contatto *</Label>
            {selectedContactId ? (
              <div className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">
                  {contacts?.find((c) => c.id === selectedContactId)?.first_name ||
                    "Contatto selezionato"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedContactId(null)}
                >
                  Cambia
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca per nome, telefono, email..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {contactSearch.length >= 2 && (
                  <div className="max-h-40 overflow-y-auto border rounded">
                    {searchLoading ? (
                      <p className="p-2 text-sm text-muted-foreground">Caricamento...</p>
                    ) : contacts && contacts.length > 0 ? (
                      contacts.map((contact) => (
                        <button
                          key={contact.id}
                          className="w-full text-left p-2 hover:bg-muted text-sm border-b last:border-b-0"
                          onClick={() => {
                            setSelectedContactId(contact.id);
                            setContactSearch("");
                          }}
                        >
                          <span className="font-medium">
                            {contact.first_name} {contact.last_name}
                          </span>
                          {contact.primary_phone && (
                            <span className="text-muted-foreground ml-2">
                              {contact.primary_phone}
                            </span>
                          )}
                        </button>
                      ))
                    ) : (
                      <p className="p-2 text-sm text-muted-foreground">
                        Nessun contatto trovato
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate
                      ? format(selectedDate, "PPP", { locale: it })
                      : "Seleziona data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                    locale={it}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Ora *</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Durata</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minuti</SelectItem>
                <SelectItem value="60">1 ora</SelectItem>
                <SelectItem value="90">1 ora e 30 minuti</SelectItem>
                <SelectItem value="120">2 ore</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Address */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-2">
              <Label>Indirizzo</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Via/Piazza..."
              />
            </div>
            <div className="space-y-2">
              <Label>CAP</Label>
              <Input
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                placeholder="00000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Città</Label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Città"
            />
          </div>

          {/* Assign Sales */}
          <div className="space-y-2">
            <Label>Assegna venditore</Label>
            <Select value={assignedSalesUserId} onValueChange={setAssignedSalesUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona venditore (opzionale)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nessuno</SelectItem>
                {salesUsers.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>
                    {user.full_name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note aggiuntive..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedContactId || !selectedDate || createAppointment.isPending}
          >
            {createAppointment.isPending ? "Creazione..." : "Crea Appuntamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
