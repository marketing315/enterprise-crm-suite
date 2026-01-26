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
      <TabsList className="h-auto p-1 gap-1">
        {showMyQueue && (
          <TabsTrigger
            value="my_queue"
            className={cn(
              "gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            )}
            data-testid="tab-my-queue"
          >
            <User className="h-4 w-4" />
            My Queue
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
            "gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          )}
          data-testid="tab-unassigned"
        >
          <Users className="h-4 w-4" />
          Non assegnati
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
            "gap-2 data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground"
          )}
          data-testid="tab-sla-breached"
        >
          <AlertTriangle className="h-4 w-4" />
          Scaduti SLA
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
          className="gap-2"
          data-testid="tab-all"
        >
          <List className="h-4 w-4" />
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
