import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

interface DateRangeFilterProps {
  fromDate: Date | undefined;
  toDate: Date | undefined;
  onFromDateChange: (date: Date | undefined) => void;
  onToDateChange: (date: Date | undefined) => void;
  label?: string;
}

export function DateRangeFilter({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  label = "Data creazione",
}: DateRangeFilterProps) {
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const hasFilter = fromDate || toDate;

  const clearFilters = () => {
    onFromDateChange(undefined);
    onToDateChange(undefined);
  };

  return (
    <div className="flex items-center gap-2">
      {label && <Label className="text-sm text-muted-foreground shrink-0">{label}:</Label>}
      
      {/* From Date */}
      <Popover open={fromOpen} onOpenChange={setFromOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 w-[130px] justify-start text-left font-normal",
              !fromDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {fromDate ? format(fromDate, "dd/MM/yyyy") : "Da"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={fromDate}
            onSelect={(date) => {
              onFromDateChange(date);
              setFromOpen(false);
            }}
            disabled={(date) => (toDate ? date > toDate : false)}
            initialFocus
            locale={it}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* To Date */}
      <Popover open={toOpen} onOpenChange={setToOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 w-[130px] justify-start text-left font-normal",
              !toDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {toDate ? format(toDate, "dd/MM/yyyy") : "A"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={toDate}
            onSelect={(date) => {
              onToDateChange(date);
              setToOpen(false);
            }}
            disabled={(date) => (fromDate ? date < fromDate : false)}
            initialFocus
            locale={it}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* Clear button */}
      {hasFilter && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={clearFilters}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
