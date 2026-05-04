import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FieldHelpProps {
  text: string;
  className?: string;
}

/**
 * Inline help tooltip for non-obvious form fields / column headers.
 * Usage: <Label>Priorità AI <FieldHelp text="Calcolata su urgenza, valore deal, SLA residuo." /></Label>
 */
export function FieldHelp({ text, className }: FieldHelpProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Aiuto: ${text}`}
            className={cn(
              "inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary align-middle ml-1",
              className,
            )}
            onClick={(e) => e.preventDefault()}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
