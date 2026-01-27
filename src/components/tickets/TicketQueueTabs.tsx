import { User, Users, AlertTriangle, List } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as QueueTab)} data-testid="tickets-tabs">
      <TabsList className="h-auto p-1 gap-1 flex-wrap w-full sm:w-auto">
        {showMyQueue && (
          <TabsTrigger
            value="my_queue"
            className={cn(
              "gap-1.5 md:gap-2 text-xs md:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex-1 sm:flex-none"
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
          </TabsTrigger>
        )}
        <TabsTrigger
          value="unassigned"
          className={cn(
            "gap-1.5 md:gap-2 text-xs md:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex-1 sm:flex-none"
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
        </TabsTrigger>
        <TabsTrigger
          value="sla_breached"
          className={cn(
            "gap-1.5 md:gap-2 text-xs md:text-sm data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground flex-1 sm:flex-none"
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
        </TabsTrigger>
        <TabsTrigger
          value="all"
          className="gap-1.5 md:gap-2 text-xs md:text-sm flex-1 sm:flex-none"
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
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
