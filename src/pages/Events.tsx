import { useState } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { Inbox, Filter, ExternalLink, Archive, Calendar, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContactDetailSheet } from "@/components/contacts/ContactDetailSheet";
import { TagFilter } from "@/components/tags/TagFilter";

type PeriodFilter = "today" | "7days" | "30days" | "all";

interface LeadEventWithContact {
  id: string;
  brand_id: string;
  contact_id: string | null;
  source: string;
  source_name: string | null;
  received_at: string;
  ai_priority: number | null;
  archived: boolean;
  raw_payload: Record<string, unknown>;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    contact_phones: { phone_raw: string; is_primary: boolean }[];
  } | null;
}

export default function Events() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const queryClient = useQueryClient();
  
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("7days");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ["lead-events", currentBrand?.id, periodFilter, sourceFilter, showArchived],
    queryFn: async (): Promise<LeadEventWithContact[]> => {
      if (!currentBrand) return [];

      let query = supabase
        .from("lead_events")
        .select(`
          id, brand_id, contact_id, source, source_name, received_at, ai_priority, archived, raw_payload,
          contact:contacts(id, first_name, last_name, contact_phones(phone_raw, is_primary))
        `)
        .eq("brand_id", currentBrand.id)
        .order("received_at", { ascending: false })
        .limit(100);

      // Period filter
      if (periodFilter !== "all") {
        const now = new Date();
        let startDate: Date;
        
        switch (periodFilter) {
          case "today":
            startDate = startOfDay(now);
            break;
          case "7days":
            startDate = startOfDay(subDays(now, 7));
            break;
          case "30days":
            startDate = startOfDay(subDays(now, 30));
            break;
          default:
            startDate = startOfDay(subDays(now, 7));
        }
        
        query = query.gte("received_at", startDate.toISOString());
      }

      // Source filter
      if (sourceFilter !== "all") {
        query = query.eq("source", sourceFilter as "webhook" | "manual" | "import" | "api");
      }

      // Archived filter
      if (!showArchived) {
        query = query.eq("archived", false);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as unknown as LeadEventWithContact[];
    },
    enabled: !!currentBrand,
  });

  // Get unique sources for filter
  const uniqueSources = [...new Set(events?.map((e) => e.source) || [])];

  const handleOpenContact = (contactId: string | null) => {
    if (contactId) {
      setSelectedContactId(contactId);
      setSheetOpen(true);
    }
  };

  const handleArchive = async (eventId: string, archived: boolean) => {
    await supabase
      .from("lead_events")
      .update({ archived } as never)
      .eq("id", eventId);
    
    queryClient.invalidateQueries({ queryKey: ["lead-events"] });
  };

  const getContactName = (event: LeadEventWithContact) => {
    if (!event.contact) return "—";
    const parts = [event.contact.first_name, event.contact.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Senza nome";
  };

  const getContactPhone = (event: LeadEventWithContact) => {
    if (!event.contact?.contact_phones?.length) return "—";
    const primary = event.contact.contact_phones.find((p) => p.is_primary);
    return primary?.phone_raw || event.contact.contact_phones[0].phone_raw;
  };

  const getSourceBadgeVariant = (source: string) => {
    switch (source) {
      case "webhook":
        return "default";
      case "manual":
        return "secondary";
      case "import":
        return "outline";
      default:
        return "outline";
    }
  };

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <Inbox className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare gli eventi.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Inbox className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Eventi Lead</h1>
            <p className="text-sm text-muted-foreground">
              {events?.length || 0} eventi in {currentBrand?.name}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Aggiorna
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          
          {/* Period filter */}
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Oggi</SelectItem>
              <SelectItem value="7days">Ultimi 7 giorni</SelectItem>
              <SelectItem value="30days">Ultimi 30 giorni</SelectItem>
              <SelectItem value="all">Tutti</SelectItem>
            </SelectContent>
          </Select>

          {/* Source filter */}
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Fonte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le fonti</SelectItem>
              {uniqueSources.map((source) => (
                <SelectItem key={source} value={source}>
                  {source === "webhook" ? "Webhook" : source === "manual" ? "Manuale" : source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Archived toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
          <Label htmlFor="show-archived" className="text-sm">
            Mostra archiviati
          </Label>
        </div>
        
        {/* Tag Filter */}
        <TagFilter
          selectedTagIds={selectedTagIds}
          onTagsChange={setSelectedTagIds}
          scope="event"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Ora</TableHead>
              <TableHead>Fonte</TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Priorità</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))
            ) : events?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nessun evento trovato
                </TableCell>
              </TableRow>
            ) : (
              events?.map((event) => (
                <TableRow key={event.id} className={event.archived ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    {format(new Date(event.received_at), "dd MMM HH:mm", { locale: it })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getSourceBadgeVariant(event.source)}>
                      {event.source_name || event.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {getContactPhone(event)}
                  </TableCell>
                  <TableCell>{getContactName(event)}</TableCell>
                  <TableCell>
                    {event.ai_priority !== null ? (
                      <Badge variant={event.ai_priority >= 8 ? "destructive" : event.ai_priority >= 5 ? "default" : "secondary"}>
                        {event.ai_priority}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {event.archived ? (
                      <Badge variant="outline">Archiviato</Badge>
                    ) : (
                      <Badge variant="secondary">Attivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {event.contact_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenContact(event.contact_id)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchive(event.id, !event.archived)}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Contact Detail Sheet */}
      <ContactDetailSheet
        contactId={selectedContactId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
