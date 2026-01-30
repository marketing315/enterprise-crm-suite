import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Milestone {
  id: string;
  label: string;
  status: "completed" | "current" | "upcoming";
}

const milestones: Milestone[] = [
  { id: "m0", label: "Setup Fondamentale", status: "completed" },
  { id: "m1", label: "Webhook Inbound & Contatti", status: "completed" },
  { id: "m2", label: "Deal & Pipeline", status: "completed" },
  { id: "m5", label: "Sistema Ticketing + SLA", status: "completed" },
  { id: "m8", label: "Outbound Webhooks", status: "completed" },
  { id: "m9", label: "Google Sheets Export", status: "completed" },
  { id: "m10", label: "Meta Lead Ads", status: "current" },
  { id: "m11", label: "Analytics Avanzati", status: "upcoming" },
];

export function DashboardMilestones() {
  const completedCount = milestones.filter((m) => m.status === "completed").length;
  const progress = Math.round((completedCount / milestones.length) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Roadmap Prodotto</CardTitle>
            <CardDescription>Progressi implementazione</CardDescription>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-primary">{progress}%</span>
            <p className="text-xs text-muted-foreground">{completedCount}/{milestones.length}</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {milestones.map((milestone, index) => (
            <div 
              key={milestone.id}
              className={cn(
                "flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors",
                milestone.status === "current" && "bg-primary/5 border border-primary/20",
                milestone.status === "upcoming" && "opacity-50"
              )}
            >
              {milestone.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              ) : milestone.status === "current" ? (
                <ArrowRight className="h-4 w-4 text-primary flex-shrink-0 animate-pulse" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className={cn(
                "text-sm",
                milestone.status === "completed" && "text-muted-foreground",
                milestone.status === "current" && "font-medium text-foreground"
              )}>
                {milestone.label}
              </span>
              {milestone.status === "current" && (
                <span className="ml-auto text-xs font-medium text-primary">In corso</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
