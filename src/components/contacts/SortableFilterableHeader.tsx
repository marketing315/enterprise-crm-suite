import { useState } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc' | null;

export interface DateFilter {
  from?: Date;
  to?: Date;
}

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

interface SortableFilterableHeaderProps {
  label: string;
  columnKey: string;
  isDateColumn?: boolean;
  sortConfig?: SortConfig | null;
  onSort?: (key: string, direction: SortDirection) => void;
  dateFilter?: DateFilter;
  onDateFilterChange?: (key: string, filter: DateFilter | null) => void;
}

export function SortableFilterableHeader({
  label,
  columnKey,
  isDateColumn = false,
  sortConfig,
  onSort,
  dateFilter,
  onDateFilterChange,
}: SortableFilterableHeaderProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  
  const isCurrentSort = sortConfig?.key === columnKey;
  const currentDirection = isCurrentSort ? sortConfig?.direction : null;
  
  const handleSort = () => {
    if (!onSort) return;
    
    let newDirection: SortDirection;
    if (!currentDirection) {
      newDirection = 'desc'; // Default to newest first for dates
    } else if (currentDirection === 'desc') {
      newDirection = 'asc';
    } else {
      newDirection = null;
    }
    
    onSort(columnKey, newDirection);
  };

  const hasDateFilter = dateFilter?.from || dateFilter?.to;

  const handleClearFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDateFilterChange?.(columnKey, null);
    setFilterOpen(false);
  };

  const SortIcon = () => {
    if (!currentDirection) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    }
    return currentDirection === 'asc' 
      ? <ArrowUp className="h-3.5 w-3.5" />
      : <ArrowDown className="h-3.5 w-3.5" />;
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 data-[state=open]:bg-accent"
        onClick={handleSort}
      >
        <span>{label}</span>
        <SortIcon />
      </Button>
      
      {isDateColumn && onDateFilterChange && (
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-6 w-6",
                hasDateFilter && "text-primary bg-primary/10"
              )} aria-label="Calendario">
              {hasDateFilter ? (
                <Calendar className="h-3.5 w-3.5" />
              ) : (
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="p-3 border-b">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Filtra per data</span>
                {hasDateFilter && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleClearFilter} aria-label="Chiudi">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            
            <div className="p-3 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Da:</p>
                <CalendarComponent
                  mode="single"
                  selected={dateFilter?.from}
                  onSelect={(date) => {
                    onDateFilterChange?.(columnKey, {
                      ...dateFilter,
                      from: date || undefined,
                    });
                  }}
                  locale={it}
                  className="rounded border"
                />
                {dateFilter?.from && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(dateFilter.from, 'dd MMM yyyy', { locale: it })}
                  </p>
                )}
              </div>
              
              <div>
                <p className="text-xs text-muted-foreground mb-2">A:</p>
                <CalendarComponent
                  mode="single"
                  selected={dateFilter?.to}
                  onSelect={(date) => {
                    onDateFilterChange?.(columnKey, {
                      ...dateFilter,
                      to: date || undefined,
                    });
                  }}
                  locale={it}
                  disabled={(date) => dateFilter?.from ? date < dateFilter.from : false}
                  className="rounded border"
                />
                {dateFilter?.to && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(dateFilter.to, 'dd MMM yyyy', { locale: it })}
                  </p>
                )}
              </div>
            </div>
            
            {hasDateFilter && (
              <div className="p-3 border-t bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  Filtro attivo: {dateFilter?.from ? format(dateFilter.from, 'dd/MM/yy', { locale: it }) : '...'} 
                  {' → '} 
                  {dateFilter?.to ? format(dateFilter.to, 'dd/MM/yy', { locale: it }) : '...'}
                </p>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
