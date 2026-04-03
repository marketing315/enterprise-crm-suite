import { CalendarCheck, CalendarClock, Calendar } from "lucide-react";
import type { AppointmentWithRelations } from "@/types/database";

interface AppointmentWeekStatsProps {
  appointments: AppointmentWithRelations[];
}

export function AppointmentWeekStats({ appointments }: AppointmentWeekStatsProps) {
  const total = appointments.length;
  const confirmed = appointments.filter((a) => a.status === "confirmed" || a.status === "visited").length;
  const pending = appointments.filter((a) => a.status === "scheduled" || a.status === "rescheduled").length;

  const stats = [
    { label: "Totale", value: total, icon: Calendar, className: "bg-primary/10 text-primary" },
    { label: "Confermati", value: confirmed, icon: CalendarCheck, className: "bg-emerald-500/10 text-emerald-600" },
    { label: "Da confermare", value: pending, icon: CalendarClock, className: "bg-amber-500/10 text-amber-600" },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${stat.className}`}
        >
          <stat.icon className="h-3.5 w-3.5" />
          <span className="tabular-nums">{stat.value}</span>
          <span className="opacity-70">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
