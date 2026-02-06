import { User, Users, AlertTriangle, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type QueueTab = "my_queue" | "unassigned" | "sla_breached" | "all";

interface TicketQueueTabsProps {
  value: QueueTab;
  onChange: (value: QueueTab) => void;
  counts: {
    myQueue: number;
    unassigned: number;
    slaBreached: number;
    all: number;
  };
  showMyQueue: boolean; // Hide for users without operator role
}

export function TicketQueueTabs({
  value,
  onChange,
  counts,
  showMyQueue,
}: TicketQueueTabsProps) {
  const handleTabClick = (tab: QueueTab) => {
    if (tab !== value) {
      onChange(tab);
    }
  };

  return (
    <div className="inline-flex h-auto items-center justify-center rounded-md bg-muted p-1 text-muted-foreground gap-1 flex-wrap w-full sm:w-auto" data-testid="tickets-tabs">
      {showMyQueue && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handleTabClick("my_queue")}
          className={cn(
            "gap-1.5 md:gap-2 text-xs md:text-sm rounded-sm px-3 py-1.5 font-medium flex-1 sm:flex-none",
            value === "my_queue" 
              ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground" 
              : "hover:bg-background/50"
          )}
          data-testid="tab-my-queue"
        >
          <User className="h-3.5 w-3.5 md:h-4 md:w-4" />
          <span className="hidden sm:inline">My Queue</span>
          <span className="sm:hidden">Miei</span>
          <Badge
            variant={value === "my_queue" ? "secondary" : "outline"}
            className="ml-1 h-5 px-1.5 text-xs"
          >
            {counts.myQueue}
          </Badge>
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => handleTabClick("unassigned")}
        className={cn(
          "gap-1.5 md:gap-2 text-xs md:text-sm rounded-sm px-3 py-1.5 font-medium flex-1 sm:flex-none",
          value === "unassigned" 
            ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground" 
            : "hover:bg-background/50"
        )}
        data-testid="tab-unassigned"
      >
        <Users className="h-3.5 w-3.5 md:h-4 md:w-4" />
        <span className="hidden sm:inline">Non assegnati</span>
        <span className="sm:hidden">Liberi</span>
        <Badge
          variant={value === "unassigned" ? "secondary" : "outline"}
          className={cn(
            "ml-1 h-5 px-1.5 text-xs",
            counts.unassigned > 0 && value !== "unassigned" && "bg-amber-100 text-amber-700 border-amber-300"
          )}
        >
          {counts.unassigned}
        </Badge>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => handleTabClick("sla_breached")}
        className={cn(
          "gap-1.5 md:gap-2 text-xs md:text-sm rounded-sm px-3 py-1.5 font-medium flex-1 sm:flex-none",
          value === "sla_breached" 
            ? "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground" 
            : "hover:bg-background/50"
        )}
        data-testid="tab-sla-breached"
      >
        <AlertTriangle className="h-3.5 w-3.5 md:h-4 md:w-4" />
        <span className="hidden sm:inline">Scaduti SLA</span>
        <span className="sm:hidden">SLA</span>
        <Badge
          variant={value === "sla_breached" ? "secondary" : "outline"}
          className={cn(
            "ml-1 h-5 px-1.5 text-xs",
            counts.slaBreached > 0 && value !== "sla_breached" && "bg-destructive/10 text-destructive border-destructive/30"
          )}
        >
          {counts.slaBreached}
        </Badge>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => handleTabClick("all")}
        className={cn(
          "gap-1.5 md:gap-2 text-xs md:text-sm rounded-sm px-3 py-1.5 font-medium flex-1 sm:flex-none",
          value === "all" 
            ? "bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground" 
            : "hover:bg-background/50"
        )}
        data-testid="tab-all"
      >
        <List className="h-3.5 w-3.5 md:h-4 md:w-4" />
        Tutti
        <Badge
          variant={value === "all" ? "secondary" : "outline"}
          className="ml-1 h-5 px-1.5 text-xs"
        >
          {counts.all}
        </Badge>
      </Button>
    </div>
  );
}
