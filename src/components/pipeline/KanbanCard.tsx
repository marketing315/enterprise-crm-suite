import { useState, forwardRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { User, Mail, Clock, DollarSign, MoreVertical, Archive, Trophy, XCircle, MoveRight, Megaphone, Building2 } from "lucide-react";
import { recordKanbanTransition } from "@/hooks/useKanbanTransitionAudit";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EntityTagList } from "@/components/tags/EntityTagList";
import { useUpdateDealStatus, useUpdateDealStage, usePipelineStages } from "@/hooks/usePipeline";
import { toast } from "sonner";
import type { DealStatus } from "@/types/database";
import type { DealWithBrand } from "@/hooks/usePipeline";
import type { TagAssignment } from "@/hooks/useTags";

interface KanbanCardProps {
  deal: DealWithBrand;
  onClick?: () => void;
  readOnly?: boolean;
  showBrand?: boolean;
  preloadedTags?: TagAssignment[];
}

export const KanbanCard = forwardRef<HTMLDivElement, KanbanCardProps>(
  function KanbanCard({ deal, onClick, readOnly = false, showBrand = false, preloadedTags }, ref) {
    const [menuOpen, setMenuOpen] = useState(false);
    const { data: stages } = usePipelineStages();
    const updateStatus = useUpdateDealStatus();
    const updateStage = useUpdateDealStage();

    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      isDragging,
    } = useDraggable({ id: deal.id });

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
      transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      opacity: isDragging ? 0.5 : 1,
    };

    const getFullName = () => {
      const parts = [deal.contact?.first_name, deal.contact?.last_name].filter(Boolean);
      return parts.length > 0 ? parts.join(" ") : "Senza nome";
    };

    const handleStatusChange = (status: DealStatus) => {
      updateStatus.mutate(
        { dealId: deal.id, status, dealBrandId: deal.brand_id },
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
      if (stageId === deal.current_stage_id) return;
      const fromStageLabel = stages?.find((s) => s.id === deal.current_stage_id)?.name || null;
      const toStageLabel = stages?.find((s) => s.id === stageId)?.name || "";
      updateStage.mutate(
        { dealId: deal.id, stageId, dealBrandId: deal.brand_id },
        {
          onSuccess: () => {
            toast.success(`Deal spostato in "${toStageLabel}"`);
            recordKanbanTransition({
              dealId: deal.id,
              brandId: deal.brand_id,
              fromStageId: deal.current_stage_id || null,
              fromStageLabel,
              toStageId: stageId,
              toStageLabel,
            });
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

    // Brand colors mapping
    const getBrandColor = (slug: string): string => {
      const colors: Record<string, string> = {
        sonimed: "#89b928",
        mymed: "#1990ca",
        excell: "#e5176c",
      };
      return colors[slug?.toLowerCase()] || "hsl(var(--primary))";
    };

    return (
      <Card
        ref={combinedRef}
        style={style}
        {...attributes}
        {...(menuOpen || readOnly ? {} : listeners)}
        className={`hover:shadow-md transition-shadow relative group w-full max-w-full overflow-hidden ${
          readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        }`}
        onClick={onClick}
      >
        {/* Action Menu Button - Hidden for read-only users */}
        {!readOnly && (
          <div 
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Azioni deal">
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
        )}

        <CardContent className="p-3 space-y-2">
          {/* Brand Badge with official brand colors */}
          {showBrand && deal.brand && (
            <div 
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md w-fit -mt-1 mb-1 text-white font-medium"
              style={{ 
                backgroundColor: getBrandColor(deal.brand.slug) 
              }}
            >
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[150px]">{deal.brand.name}</span>
            </div>
          )}
          
          <div className="flex items-start justify-between gap-2 pr-6">
            <div className="flex items-center gap-2 text-sm font-medium truncate">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{getFullName()}</span>
            </div>
            <div className="flex items-center gap-1">
              {/* Assigned User Badge — Bug #3 (MEDIA): tipo già su DealWithBrand, no `as any` */}
              {deal.assigned_user && (
                <div 
                  className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary"
                  title={`Assegnato a: ${deal.assigned_user.full_name || deal.assigned_user.email}`}
                >
                  {(deal.assigned_user.full_name || deal.assigned_user.email)
                    ?.split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
              )}
              <Badge variant="outline" className={statusColors[deal.status] || ""}>
                {deal.status === "open" ? "Aperto" : 
                 deal.status === "won" ? "Vinto" :
                 deal.status === "lost" ? "Perso" :
                 deal.status === "closed" ? "Chiuso" : "Riaperto"}
              </Badge>
            </div>
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

          {/* Marketing Campaign Badge */}
          {deal.marketing_campaign && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs text-primary/80 bg-primary/5 px-2 py-0.5 rounded-full w-fit">
                  <Megaphone className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[120px]">{deal.marketing_campaign.name}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Campagna: {deal.marketing_campaign.name}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Deal Tags */}
          <div className="pt-1 border-t" onClick={(e) => e.stopPropagation()}>
            <EntityTagList 
              entityType="deal" 
              entityId={deal.id} 
              scope="deal"
              size="sm"
              preloadedAssignments={preloadedTags}
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

KanbanCard.displayName = "KanbanCard";
