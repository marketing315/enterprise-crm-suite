import { format, isSameDay, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AppointmentDaySelectorProps {
  weekStart: Date;
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  appointmentCounts: Record<string, number>;
}

export function AppointmentDaySelector({
  weekStart,
  selectedDay,
  onSelectDay,
  appointmentCounts,
}: AppointmentDaySelectorProps) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {days.map((day) => {
        const dateKey = format(day, "yyyy-MM-dd");
        const isToday = isSameDay(day, today);
        const isSelected = isSameDay(day, selectedDay);
        const count = appointmentCounts[dateKey] || 0;

        return (
          <button
            key={dateKey}
            onClick={() => onSelectDay(day)}
            className={cn(
              "flex flex-col items-center min-w-[3rem] px-2 py-2 rounded-xl transition-all duration-200",
              isSelected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "hover:bg-accent"
            )}
          >
            <span className="text-[10px] uppercase font-medium opacity-70">
              {format(day, "EEE", { locale: it })}
            </span>
            <span className={cn("text-lg font-semibold", isToday && !isSelected && "text-primary")}>
              {format(day, "d")}
            </span>
            {count > 0 && (
              <span
                className={cn(
                  "text-[9px] font-medium rounded-full px-1.5 min-w-[1rem] text-center",
                  isSelected
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-primary/10 text-primary"
                )}
              >
                {count}
              </span>
            )}
            {count === 0 && isToday && !isSelected && (
              <span className="h-1 w-1 rounded-full bg-primary mt-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}
