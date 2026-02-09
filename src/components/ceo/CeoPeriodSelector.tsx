import { useState, useMemo } from 'react';
import { format, subDays, subMonths, subYears, startOfMonth, endOfMonth } from 'date-fns';
import { it } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type Preset = '1Y' | '6M' | '3M' | '1M' | '7D' | 'custom';

interface CeoPeriodSelectorProps {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: '1Y', label: '1 Anno' },
  { key: '6M', label: '6 Mesi' },
  { key: '3M', label: '3 Mesi' },
  { key: '1M', label: '1 Mese' },
  { key: '7D', label: '7 Giorni' },
];

function computePresetDates(preset: Preset): { from: Date; to: Date } {
  const today = new Date();
  switch (preset) {
    case '1Y': return { from: subYears(today, 1), to: today };
    case '6M': return { from: subMonths(today, 6), to: today };
    case '3M': return { from: subMonths(today, 3), to: today };
    case '1M': return { from: startOfMonth(today), to: endOfMonth(today) };
    case '7D': return { from: subDays(today, 7), to: today };
    default: return { from: startOfMonth(today), to: endOfMonth(today) };
  }
}

export function CeoPeriodSelector({ from, to, onChange }: CeoPeriodSelectorProps) {
  const [activePreset, setActivePreset] = useState<Preset>('1M');

  const handlePreset = (preset: Preset) => {
    setActivePreset(preset);
    const dates = computePresetDates(preset);
    onChange(dates.from, dates.to);
  };

  const periodLabel = useMemo(() => {
    return `${format(from, 'dd MMM yyyy', { locale: it })} — ${format(to, 'dd MMM yyyy', { locale: it })}`;
  }, [from, to]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(p => (
        <Button
          key={p.key}
          variant={activePreset === p.key ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePreset(p.key)}
        >
          {p.label}
        </Button>
      ))}

      {/* Custom date pickers */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn('gap-1', activePreset === 'custom' && 'border-primary')}>
            <CalendarIcon className="h-3.5 w-3.5" />
            Da
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={from}
            onSelect={(date) => {
              if (date) {
                setActivePreset('custom');
                onChange(date, to);
              }
            }}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn('gap-1', activePreset === 'custom' && 'border-primary')}>
            <CalendarIcon className="h-3.5 w-3.5" />
            A
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={to}
            onSelect={(date) => {
              if (date) {
                setActivePreset('custom');
                onChange(from, date);
              }
            }}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">
        {periodLabel}
      </span>
    </div>
  );
}
