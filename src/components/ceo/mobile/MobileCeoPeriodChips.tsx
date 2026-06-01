import { useState } from 'react';
import { format, subDays, subMonths, subYears, startOfMonth, endOfMonth } from 'date-fns';
import { it } from 'date-fns/locale';
import { Calendar as CalendarIcon, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Segmented, type ChipOption } from '@/components/mobile/Segmented';

type Preset = '1Y' | '6M' | '3M' | '1M' | '7D' | 'custom';

const PRESET_OPTIONS: ChipOption<Exclude<Preset, 'custom'>>[] = [
  { value: '7D', label: '7g' },
  { value: '1M', label: 'Mese' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1A' },
];

function computePresetDates(preset: Preset) {
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

interface Props {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
}

export function MobileCeoPeriodChips({ from, to, onChange }: Props) {
  const [active, setActive] = useState<Preset>('1M');
  const [openSheet, setOpenSheet] = useState(false);

  const handlePreset = (p: Exclude<Preset, 'custom'>) => {
    setActive(p);
    const d = computePresetDates(p);
    onChange(d.from, d.to);
  };

  const periodLabel = `${format(from, 'dd MMM', { locale: it })} → ${format(to, 'dd MMM', { locale: it })}`;
  const isCustom = active === 'custom';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 flex items-center gap-1.5">
        <Segmented<Exclude<Preset, 'custom'>>
          options={PRESET_OPTIONS}
          value={isCustom ? ('1M' as Exclude<Preset, 'custom'>) : (active as Exclude<Preset, 'custom'>)}
          onChange={handlePreset}
          className="flex-1"
          ariaLabel="Preset periodo"
        />

        <Sheet open={openSheet} onOpenChange={setOpenSheet}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                'shrink-0 h-9 px-3 rounded-full text-sm font-medium flex items-center gap-1.5 transition-all press-scale',
                isCustom
                  ? 'bg-foreground text-background shadow-sm'
                  : 'bg-muted/60 text-foreground/70 hover:bg-muted'
              )}
              aria-label="Periodo personalizzato"
            >
              <CalendarIcon className="h-3.5 w-3.5" aria-hidden />
              {isCustom ? periodLabel : 'Custom'}
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl pt-6 max-h-[90vh] overflow-y-auto">
            <SheetHeader className="mb-4">
              <SheetTitle>Periodo personalizzato</SheetTitle>
            </SheetHeader>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Da</p>
                <Calendar
                  mode="single"
                  selected={from}
                  onSelect={(d) => {
                    if (d) {
                      setActive('custom');
                      onChange(d, to);
                    }
                  }}
                  className="rounded-md border pointer-events-auto"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">A</p>
                <Calendar
                  mode="single"
                  selected={to}
                  onSelect={(d) => {
                    if (d) {
                      setActive('custom');
                      onChange(from, d);
                    }
                  }}
                  className="rounded-md border pointer-events-auto"
                />
              </div>
              <Button className="w-full h-12 rounded-xl" onClick={() => setOpenSheet(false)}>
                <Check className="h-4 w-4 mr-2" />
                Conferma
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
