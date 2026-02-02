import { useState } from "react";
import { Check, ChevronsUpDown, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAssignableSalespersons } from "@/hooks/useSalespersonKpis";

interface SalespersonAssignmentSelectProps {
  value: string | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
}

export function SalespersonAssignmentSelect({
  value,
  onChange,
  disabled,
}: SalespersonAssignmentSelectProps) {
  const [open, setOpen] = useState(false);
  const { data: salespersons = [], isLoading } = useAssignableSalespersons();

  const selectedPerson = salespersons.find((p) => p.id === value);

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled || isLoading}
        >
          {selectedPerson ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[10px]">
                  {getInitials(selectedPerson.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{selectedPerson.full_name || selectedPerson.email}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Non assegnato</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0">
        <Command>
          <CommandInput placeholder="Cerca venditore..." />
          <CommandList>
            <CommandEmpty>Nessun venditore trovato.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__unassigned__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <UserX className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Non assegnato</span>
                <Check
                  className={cn(
                    "ml-auto h-4 w-4",
                    value === null ? "opacity-100" : "opacity-0"
                  )}
                />
              </CommandItem>
              {salespersons.map((person) => (
                <CommandItem
                  key={person.id}
                  value={person.full_name || person.email}
                  onSelect={() => {
                    onChange(person.id);
                    setOpen(false);
                  }}
                >
                  <Avatar className="mr-2 h-5 w-5">
                    <AvatarFallback className="text-[10px]">
                      {getInitials(person.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span>{person.full_name || "—"}</span>
                    <span className="text-xs text-muted-foreground">{person.email}</span>
                  </div>
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      value === person.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
