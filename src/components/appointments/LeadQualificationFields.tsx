import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClinicalTopicsSelector } from "./ClinicalTopicsSelector";
import type {
  LeadSourceChannel,
  ContactChannel,
  PacemakerStatus,
  CustomerSentiment,
  DecisionStatus,
  ObjectionType,
} from "@/types/database";

interface LeadQualificationFieldsProps {
  // Source
  leadSourceChannel: LeadSourceChannel | null;
  onLeadSourceChannelChange: (value: LeadSourceChannel | null) => void;
  contactChannel: ContactChannel | null;
  onContactChannelChange: (value: ContactChannel | null) => void;
  
  // Clinical topics
  selectedTopicIds: string[];
  onTopicIdsChange: (ids: string[]) => void;
  
  // Medical
  pacemakerStatus: PacemakerStatus | null;
  onPacemakerStatusChange: (value: PacemakerStatus | null) => void;
  
  // Customer evaluation
  customerSentiment: CustomerSentiment | null;
  onCustomerSentimentChange: (value: CustomerSentiment | null) => void;
  decisionStatus: DecisionStatus | null;
  onDecisionStatusChange: (value: DecisionStatus | null) => void;
  objectionType: ObjectionType | null;
  onObjectionTypeChange: (value: ObjectionType | null) => void;
  
  // Notes
  logisticsNotes: string;
  onLogisticsNotesChange: (value: string) => void;
  bookingNotes: string;
  onBookingNotesChange: (value: string) => void;
  aiConversationSummary?: string;
  
  disabled?: boolean;
}

export function LeadQualificationFields({
  leadSourceChannel,
  onLeadSourceChannelChange,
  contactChannel,
  onContactChannelChange,
  selectedTopicIds,
  onTopicIdsChange,
  pacemakerStatus,
  onPacemakerStatusChange,
  customerSentiment,
  onCustomerSentimentChange,
  decisionStatus,
  onDecisionStatusChange,
  objectionType,
  onObjectionTypeChange,
  logisticsNotes,
  onLogisticsNotesChange,
  bookingNotes,
  onBookingNotesChange,
  aiConversationSummary,
  disabled = false,
}: LeadQualificationFieldsProps) {
  return (
    <div className="space-y-4">
      {/* Fonte */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-3">Fonte</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Canale fonte</Label>
            <Select
              value={leadSourceChannel || "_none"}
              onValueChange={(v) =>
                onLeadSourceChannelChange(v === "_none" ? null : (v as LeadSourceChannel))
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Seleziona..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Non specificato</SelectItem>
                <SelectItem value="tv">TV</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="other">Altro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Canale contatto</Label>
            <Select
              value={contactChannel || "_none"}
              onValueChange={(v) =>
                onContactChannelChange(v === "_none" ? null : (v as ContactChannel))
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Seleziona..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Non specificato</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="call">Chiamata</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Interesse Clinico */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-3">Interesse Clinico</h4>
        <ClinicalTopicsSelector
          selectedTopicIds={selectedTopicIds}
          onSelectionChange={onTopicIdsChange}
          disabled={disabled}
        />
      </div>

      {/* Valutazione Medica */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-3">Valutazione Medica</h4>
        <div className="space-y-1.5">
          <Label className="text-xs">Pacemaker</Label>
          <Select
            value={pacemakerStatus || "_none"}
            onValueChange={(v) =>
              onPacemakerStatusChange(v === "_none" ? null : (v as PacemakerStatus))
            }
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Seleziona..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Non specificato</SelectItem>
              <SelectItem value="assente">Assente</SelectItem>
              <SelectItem value="presente">Presente</SelectItem>
              <SelectItem value="non_chiaro">Non chiaro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Valutazione Cliente */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-3">Valutazione Cliente</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Sentiment</Label>
            <Select
              value={customerSentiment || "_none"}
              onValueChange={(v) =>
                onCustomerSentimentChange(v === "_none" ? null : (v as CustomerSentiment))
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">-</SelectItem>
                <SelectItem value="positivo">Positivo</SelectItem>
                <SelectItem value="neutro">Neutro</SelectItem>
                <SelectItem value="negativo">Negativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Decisione</Label>
            <Select
              value={decisionStatus || "_none"}
              onValueChange={(v) =>
                onDecisionStatusChange(v === "_none" ? null : (v as DecisionStatus))
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">-</SelectItem>
                <SelectItem value="pronto">Pronto</SelectItem>
                <SelectItem value="indeciso">Indeciso</SelectItem>
                <SelectItem value="non_interessato">Non interessato</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Obiezione</Label>
            <Select
              value={objectionType || "_none"}
              onValueChange={(v) =>
                onObjectionTypeChange(v === "_none" ? null : (v as ObjectionType))
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">-</SelectItem>
                <SelectItem value="prezzo">Prezzo</SelectItem>
                <SelectItem value="tempo">Tempo</SelectItem>
                <SelectItem value="fiducia">Fiducia</SelectItem>
                <SelectItem value="altro">Altro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Logistica */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-3">Logistica</h4>
        <Textarea
          value={logisticsNotes}
          onChange={(e) => onLogisticsNotesChange(e.target.value)}
          placeholder="Disponibilità oraria, vincoli, location..."
          rows={2}
          className="text-sm"
          disabled={disabled}
        />
      </div>

      {/* Note Prenotazione */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-3">Note Prenotazione</h4>
        <Textarea
          value={bookingNotes}
          onChange={(e) => onBookingNotesChange(e.target.value)}
          placeholder="Note in corso di prenotazione..."
          rows={2}
          className="text-sm"
          disabled={disabled}
        />
      </div>

      {/* AI Summary (read-only) */}
      {aiConversationSummary && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-3 text-muted-foreground">
            Riassunto AI
          </h4>
          <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
            {aiConversationSummary}
          </div>
        </div>
      )}
    </div>
  );
}
