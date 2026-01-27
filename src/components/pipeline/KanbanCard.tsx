import { useState, forwardRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { User, Mail, Clock, DollarSign, MoreVertical, Archive, Trophy, XCircle, MoveRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EntityTagList } from "@/components/tags/EntityTagList";
import { useUpdateDealStatus, useUpdateDealStage, usePipelineStages } from "@/hooks/usePipeline";
import { toast } from "sonner";
import type { DealWithContact, DealStatus } from "@/types/database";

interface KanbanCardProps {
  deal: DealWithContact;
  onClick?: () => void;
}

export const KanbanCard = forwardRef<HTMLDivElement, KanbanCardProps>(
  function KanbanCard({ deal, onClick }, ref) {
    const [menuOpen, setMenuOpen] = useState(false);
    const { data: stages } = usePipelineStages();
    const updateStatus = useUpdateDealStatus();
    const updateStage = useUpdateDealStage();

    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: deal.id });

    // Combine refs for both sortable and forwardRef
    const combinedRef = (node: HTMLDivElement | null) => {
      setNodeRef(node);
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const getFullName = () => {
      const parts = [deal.contact?.first_name, deal.contact?.last_name].filter(Boolean);
      return parts.length > 0 ? parts.join(" ") : "Senza nome";
    };

    const handleStatusChange = (status: DealStatus) => {
      updateStatus.mutate(
        { dealId: deal.id, status },
        {
          onSuccess: () => {
            const statusLabels: Record<DealStatus, string> = {
              open: "Aperto",
              won: "Vinto",
              lost: "Perso",
              closed: "Archiviato",
              reopened_for_support: "Riaperto",
            };
            toast.success(`Deal marcato come "${statusLabels[status]}"`);
          },
          onError: () => {
            toast.error("Errore nell'aggiornamento dello status");
          },
        }
      );
    };

    const handleStageChange = (stageId: string) => {
      const stageName = stages?.find((s) => s.id === stageId)?.name;
      updateStage.mutate(
        { dealId: deal.id, stageId },
        {
          onSuccess: () => {
            toast.success(`Deal spostato in "${stageName}"`);
          },
          onError: () => {
            toast.error("Errore nello spostamento");
          },
        }
      );
    };

    const statusColors: Record<string, string> = {
      open: "bg-primary/10 text-primary",
      won: "bg-green-500/10 text-green-700",
      lost: "bg-destructive/10 text-destructive",
      closed: "bg-muted text-muted-foreground",
      reopened_for_support: "bg-amber-500/10 text-amber-700",
    };

    const otherStages = stages?.filter((s) => s.id !== deal.current_stage_id) || [];

    return (
      <Card
        ref={combinedRef}
        style={style}
        {...attributes}
        {...(menuOpen ? {} : listeners)}
        className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow relative group"
        onClick={onClick}
      >
        {/* Action Menu Button */}
        <div 
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover">
              <DropdownMenuItem onClick={() => handleStatusChange("won")}>
                <Trophy className="h-4 w-4 mr-2 text-green-600" />
                Segna come Vinto
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("lost")}>
                <XCircle className="h-4 w-4 mr-2 text-destructive" />
                Segna come Perso
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("closed")}>
                <Archive className="h-4 w-4 mr-2" />
                Archivia
              </DropdownMenuItem>
              
              {otherStages.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <MoveRight className="h-4 w-4 mr-2" />
                      Sposta in...
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="bg-popover">
                      {otherStages.map((stage) => (
                        <DropdownMenuItem 
                          key={stage.id} 
                          onClick={() => handleStageChange(stage.id)}
                        >
                          <div 
                            className="w-2 h-2 rounded-full mr-2" 
                            style={{ backgroundColor: stage.color || "hsl(var(--primary))" }} 
                          />
                          {stage.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2 pr-6">
            <div className="flex items-center gap-2 text-sm font-medium truncate">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{getFullName()}</span>
            </div>
            <Badge variant="outline" className={statusColors[deal.status] || ""}>
              {deal.status === "open" ? "Aperto" : 
               deal.status === "won" ? "Vinto" :
               deal.status === "lost" ? "Perso" :
               deal.status === "closed" ? "Chiuso" : "Riaperto"}
            </Badge>
          </div>

          {deal.contact?.email && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{deal.contact.email}</span>
            </div>
          )}

          {deal.value && (
            <div className="flex items-center gap-2 text-xs font-medium text-green-700">
              <DollarSign className="h-3 w-3 shrink-0" />
              <span>€{deal.value.toLocaleString("it-IT")}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{format(new Date(deal.updated_at), "dd MMM HH:mm", { locale: it })}</span>
          </div>

          {/* Deal Tags */}
          <div className="pt-1 border-t" onClick={(e) => e.stopPropagation()}>
            <EntityTagList 
              entityType="deal" 
              entityId={deal.id} 
              scope="deal"
              size="sm"
            />
          </div>

          {deal.notes && (
            <p className="text-xs text-muted-foreground line-clamp-2 pt-1 border-t">
              {deal.notes}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }
);
