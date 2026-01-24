import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TicketPriorityBadgeProps {
  priority: number;
}

const priorityConfig: Record<number, { label: string; className: string }> = {
  1: { label: "P1", className: "bg-red-500 hover:bg-red-600 text-white" },
  2: { label: "P2", className: "bg-orange-500 hover:bg-orange-600 text-white" },
  3: { label: "P3", className: "bg-yellow-500 hover:bg-yellow-600 text-black" },
  4: { label: "P4", className: "bg-blue-500 hover:bg-blue-600 text-white" },
  5: { label: "P5", className: "bg-gray-400 hover:bg-gray-500 text-white" },
};

export function TicketPriorityBadge({ priority }: TicketPriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig[3];
  
  return (
    <Badge className={cn("font-mono text-xs", config.className)}>
      {config.label}
    </Badge>
  );
}
