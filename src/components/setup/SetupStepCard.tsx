import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SetupStepCardProps {
  step: number;
  icon: LucideIcon;
  title: string;
  description: string;
  completed: boolean;
  optional?: boolean;
  children?: React.ReactNode;
}

export function SetupStepCard({ step, icon: Icon, title, description, completed, optional, children }: SetupStepCardProps) {
  return (
    <Card className={cn("transition-colors", completed && "border-primary/40 bg-primary/[0.03]")}>
      <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            completed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {completed ? <CheckCircle2 className="h-5 w-5" /> : step}
        </div>
        <div className="flex-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
            {optional && <Badge variant="outline" className="text-xs">Opzionale</Badge>}
            {completed ? (
              <Badge className="ml-auto bg-primary/15 text-primary hover:bg-primary/15">Completato</Badge>
            ) : (
              <Badge variant="secondary" className="ml-auto">
                <Circle className="mr-1 h-2.5 w-2.5" /> Da fare
              </Badge>
            )}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      {children && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}
