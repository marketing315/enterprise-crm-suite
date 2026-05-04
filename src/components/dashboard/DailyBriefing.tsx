import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, TrendingUp, AlertCircle, Calendar } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboardData } from "@/hooks/useDashboardData";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export function DailyBriefing() {
  const { user } = useAuth();
  const { leadsToday, slaBreachedTickets, appointmentsToday, isLoading } = useDashboardData();

  const name =
    (user as unknown as { preferred_name?: string | null })?.preferred_name ||
    user?.full_name?.split(" ")[0] ||
    "";

  const items: Array<{
    value: number;
    label: string;
    href: string;
    icon: typeof TrendingUp;
    tone: "info" | "warning" | "default";
  }> = [
    { value: leadsToday, label: leadsToday === 1 ? "nuovo lead" : "nuovi lead", href: "/events", icon: TrendingUp, tone: "info" },
    {
      value: slaBreachedTickets,
      label: slaBreachedTickets === 1 ? "ticket SLA in scadenza" : "ticket SLA in scadenza",
      href: "/tickets?slaBreach=true",
      icon: AlertCircle,
      tone: "warning",
    },
    {
      value: appointmentsToday,
      label: appointmentsToday === 1 ? "appuntamento oggi" : "appuntamenti oggi",
      href: "/appointments/calendar",
      icon: Calendar,
      tone: "default",
    },
  ];

  const active = items.filter((i) => i.value > 0);

  return (
    <Card className="relative overflow-hidden border bg-gradient-to-br from-primary/5 via-background to-background backdrop-blur-sm p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base md:text-lg font-semibold tracking-tight">
            {greeting()}
            {name ? `, ${name}` : ""}
          </h2>
          {isLoading ? (
            <Skeleton className="h-4 w-72 mt-2" />
          ) : active.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-1">
              Nessuna emergenza in vista. Buon lavoro!
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Oggi hai{" "}
              {active.map((it, idx) => {
                const Icon = it.icon;
                const cls =
                  it.tone === "warning"
                    ? "text-destructive"
                    : it.tone === "info"
                    ? "text-primary"
                    : "text-foreground";
                return (
                  <span key={it.label}>
                    <Link
                      to={it.href}
                      className={`inline-flex items-center gap-1 font-medium hover:underline ${cls}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {it.value} {it.label}
                    </Link>
                    {idx < active.length - 2 ? ", " : idx === active.length - 2 ? " e " : "."}
                  </span>
                );
              })}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
