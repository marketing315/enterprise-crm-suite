import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Inbox, ExternalLink, Archive, Calendar, RefreshCw, SlidersHorizontal, Shield } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLeadEvents, type PeriodFilter, type LeadEventResult } from "@/hooks/useLeadEvents";

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
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ContactDetailSheet } from "@/components/contacts/ContactDetailSheet";
import { TagFilter } from "@/components/tags/TagFilter";
import { TagBadge } from "@/components/tags/TagBadge";
import { supabase } from "@/integrations/supabase/client";

export default function Events() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const { isAdmin, isCeo } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("7days");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const canSeeArchived = isAdmin || isCeo;

  const { data, isLoading, refetch } = useLeadEvents({
    periodFilter,
    sourceFilter,
    showArchived,
    tagIds: selectedTagIds,
  });

  const events = data?.events || [];
  const totalCount = data?.total || 0;

  // Get unique sources for filter dropdown
  const uniqueSources = [...new Set(events.map((e) => e.source))];

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
    
    queryClient.invalidateQueries({ queryKey: ["lead-events-rpc"] });
  };

  const getContactName = (event: LeadEventResult) => {
    if (!event.contact?.id) return "—";
    const parts = [event.contact.first_name, event.contact.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Senza nome";
  };

  const getContactPhone = (event: LeadEventResult) => {
    return event.contact?.primary_phone || "—";
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

  const activeFiltersCount = 
    (periodFilter !== "7days" ? 1 : 0) + 
    (sourceFilter !== "all" ? 1 : 0) + 
    (showArchived ? 1 : 0) +
    (selectedTagIds.length > 0 ? 1 : 0);

  if (!hasBrandSelected) {
    return (
      <div className="p-4">
        <Alert>
          <Inbox className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare gli eventi.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const FiltersContent = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Periodo</label>
        <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
          <SelectTrigger className="w-full">
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
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Fonte</label>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full">
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

      {/* Admin/CEO only: show archived toggle */}
      {canSeeArchived && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="show-archived" className="text-sm">
              Mostra archiviati
            </Label>
          </div>
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
        </div>
      )}
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Tag</label>
        <TagFilter
          selectedTagIds={selectedTagIds}
          onTagsChange={setSelectedTagIds}
          scope="event"
        />
      </div>
    </div>
  );

  // Mobile card view for events
  const MobileEventCard = ({ event }: { event: LeadEventResult }) => (
    <Card className={event.archived ? "opacity-50" : ""}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={getSourceBadgeVariant(event.source)} className="text-xs">
                {event.source_name || event.source}
              </Badge>
              {event.ai_priority !== null && (
                <Badge 
                  variant={event.ai_priority >= 8 ? "destructive" : event.ai_priority >= 5 ? "default" : "secondary"}
                  className="text-xs"
                >
                  P{event.ai_priority}
                </Badge>
              )}
              {event.archived && (
                <Badge variant="outline" className="text-xs">Archiviato</Badge>
              )}
            </div>
            <p className="font-medium text-sm truncate">{getContactName(event)}</p>
            <p className="text-xs text-muted-foreground font-mono">{getContactPhone(event)}</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(event.received_at), "dd MMM HH:mm", { locale: it })}
            </p>
            {/* Tags */}
            {event.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {event.tags.slice(0, 3).map((tag) => (
                  <TagBadge key={tag.id} name={tag.name} color={tag.color} size="sm" />
                ))}
                {event.tags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{event.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {event.contact_id && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleOpenContact(event.contact_id)}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleArchive(event.id, !event.archived)}
            >
              <Archive className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary/10">
            <Inbox className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-semibold">Eventi Lead</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {totalCount} eventi{selectedTagIds.length > 0 && " (filtrati per tag)"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isMobile ? (
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="relative">
                  <SlidersHorizontal className="h-4 w-4" />
                  {activeFiltersCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                      {activeFiltersCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[60vh]">
                <SheetHeader>
                  <SheetTitle>Filtri</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <FiltersContent />
                </div>
              </SheetContent>
            </Sheet>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Aggiorna</span>
          </Button>
        </div>
      </div>

      {/* Desktop Filters */}
      {!isMobile && (
        <div className="flex flex-wrap items-center gap-4">
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

          {/* Admin/CEO only: show archived toggle */}
          {canSeeArchived && (
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <Switch
                id="show-archived-desktop"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <Label htmlFor="show-archived-desktop" className="text-sm">
                Mostra archiviati
              </Label>
            </div>
          )}
          
          <TagFilter
            selectedTagIds={selectedTagIds}
            onTagsChange={setSelectedTagIds}
            scope="event"
          />
        </div>
      )}

      {/* Events List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Inbox className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>Nessun evento trovato</p>
          {selectedTagIds.length > 0 && (
            <p className="text-sm mt-2">Prova a rimuovere alcuni filtri tag</p>
          )}
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          {events.map((event) => (
            <MobileEventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 text-sm font-medium">Data/Ora</th>
                <th className="text-left p-3 text-sm font-medium">Fonte</th>
                <th className="text-left p-3 text-sm font-medium">Telefono</th>
                <th className="text-left p-3 text-sm font-medium">Nome</th>
                <th className="text-left p-3 text-sm font-medium">Tag</th>
                <th className="text-left p-3 text-sm font-medium">Priorità</th>
                <th className="text-left p-3 text-sm font-medium">Stato</th>
                <th className="text-right p-3 text-sm font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className={`border-t ${event.archived ? "opacity-50" : ""}`}>
                  <td className="p-3 font-medium text-sm">
                    {format(new Date(event.received_at), "dd MMM HH:mm", { locale: it })}
                  </td>
                  <td className="p-3">
                    <Badge variant={getSourceBadgeVariant(event.source)}>
                      {event.source_name || event.source}
                    </Badge>
                  </td>
                  <td className="p-3 font-mono text-sm">
                    {getContactPhone(event)}
                  </td>
                  <td className="p-3 text-sm">{getContactName(event)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {event.tags.slice(0, 2).map((tag) => (
                        <TagBadge key={tag.id} name={tag.name} color={tag.color} size="sm" />
                      ))}
                      {event.tags.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{event.tags.length - 2}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {event.ai_priority !== null ? (
                      <Badge variant={event.ai_priority >= 8 ? "destructive" : event.ai_priority >= 5 ? "default" : "secondary"}>
                        {event.ai_priority}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {event.archived ? (
                      <Badge variant="outline">Archiviato</Badge>
                    ) : (
                      <Badge variant="secondary">Attivo</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Contact Detail Sheet */}
      <ContactDetailSheet
        contactId={selectedContactId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
