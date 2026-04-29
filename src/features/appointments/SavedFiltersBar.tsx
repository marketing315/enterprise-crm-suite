import { useEffect, useMemo, useState } from "react";
import { Bookmark, Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  APPOINTMENT_STATUS_VALUES,
  AppointmentFilter,
  RISK_LEVELS,
  SYSTEM_FILTERS,
  SavedFilter,
  isSystemFilter,
  loadActiveFilterId,
  loadUserFilters,
  newFilterId,
  saveActiveFilterId,
  saveUserFilters,
} from "./savedFilters";
import { APPOINTMENT_STATUS, type AppointmentStatus } from "./taxonomy";

interface Props {
  /** Identifica scope di persistenza: "calendar" | "ops-board" | "list" */
  scope: string;
  activeFilter: AppointmentFilter | undefined;
  activeFilterId: string | null;
  onChange: (id: string | null, filter: AppointmentFilter | undefined) => void;
}

export function SavedFiltersBar({ scope, activeFilter, activeFilterId, onChange }: Props) {
  const [userFilters, setUserFilters] = useState<SavedFilter[]>(() => loadUserFilters());
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [customDraft, setCustomDraft] = useState<AppointmentFilter>({});

  const all = useMemo(() => [...SYSTEM_FILTERS, ...userFilters], [userFilters]);
  const activeMeta = all.find((f) => f.id === activeFilterId) ?? null;

  // Persist active id quando cambia
  useEffect(() => {
    saveActiveFilterId(scope, activeFilterId);
  }, [scope, activeFilterId]);

  // Restore on mount se non c'è già attivo
  useEffect(() => {
    if (activeFilterId) return;
    const stored = loadActiveFilterId(scope);
    if (!stored) return;
    const found = all.find((f) => f.id === stored);
    if (found) onChange(found.id, found.filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const apply = (f: SavedFilter) => onChange(f.id, f.filter);

  const clear = () => onChange(null, undefined);

  const persist = (next: SavedFilter[]) => {
    setUserFilters(next);
    saveUserFilters(next);
  };

  const handleSave = () => {
    const name = draftName.trim();
    if (!name) {
      toast.error("Inserisci un nome");
      return;
    }
    if (!activeFilter || Object.keys(activeFilter).length === 0) {
      toast.error("Nessun filtro attivo da salvare");
      return;
    }
    const newF: SavedFilter = {
      id: newFilterId(),
      name,
      createdAt: new Date().toISOString(),
      filter: activeFilter,
    };
    persist([...userFilters, newF]);
    onChange(newF.id, newF.filter);
    setShowSaveDialog(false);
    setDraftName("");
    toast.success(`Filtro "${name}" salvato`);
  };

  const handleDelete = (id: string) => {
    persist(userFilters.filter((f) => f.id !== id));
    if (activeFilterId === id) clear();
    toast.success("Filtro eliminato");
  };

  const openCustom = () => {
    setCustomDraft(activeFilter ?? {});
    setShowCustomDialog(true);
  };

  const applyCustom = () => {
    const cleaned: AppointmentFilter = { ...customDraft };
    if (!cleaned.statuses?.length) delete cleaned.statuses;
    if (!cleaned.riskLevels?.length) delete cleaned.riskLevels;
    if (!cleaned.onlyMine) delete cleaned.onlyMine;
    if (!cleaned.pendingFollowUp) delete cleaned.pendingFollowUp;
    if (Object.keys(cleaned).length === 0) {
      clear();
    } else {
      onChange(null, cleaned); // custom on-the-fly, no preset
    }
    setShowCustomDialog(false);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Bookmark className="h-3.5 w-3.5" />
              {activeMeta ? (
                <span className="font-medium">{activeMeta.name}</span>
              ) : activeFilter && Object.keys(activeFilter).length > 0 ? (
                <span className="italic text-muted-foreground">Filtro custom</span>
              ) : (
                <span className="text-muted-foreground">Filtri</span>
              )}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Preset rapidi
            </DropdownMenuLabel>
            {SYSTEM_FILTERS.map((f) => (
              <DropdownMenuItem
                key={f.id}
                onClick={() => apply(f)}
                className="flex items-center justify-between"
              >
                <span>{f.name}</span>
                {activeFilterId === f.id && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
            {userFilters.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  I tuoi filtri
                </DropdownMenuLabel>
                {userFilters.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onClick={() => apply(f)}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate">{f.name}</span>
                    <div className="flex items-center gap-1">
                      {activeFilterId === f.id && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(f.id);
                        }}
                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Elimina"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={openCustom}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Filtro custom…
            </DropdownMenuItem>
            {activeFilter && Object.keys(activeFilter).length > 0 && (
              <DropdownMenuItem
                onClick={() => {
                  if (activeFilterId && isSystemFilter(activeFilterId)) {
                    setDraftName(activeMeta?.name ? `${activeMeta.name} (copia)` : "");
                  }
                  setShowSaveDialog(true);
                }}
              >
                <Bookmark className="mr-2 h-3.5 w-3.5" />
                Salva come preset…
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {activeFilter && Object.keys(activeFilter).length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-muted-foreground"
            onClick={clear}
          >
            <X className="h-3 w-3" />
            Pulisci
          </Button>
        )}

        {/* Chip riassunto */}
        {activeFilter?.statuses?.map((s) => (
          <Badge key={s} variant="secondary" className="h-6 text-[10px]">
            {APPOINTMENT_STATUS[s as AppointmentStatus]?.label ?? s}
          </Badge>
        ))}
        {activeFilter?.riskLevels?.map((r) => (
          <Badge
            key={r}
            variant="outline"
            className={cn(
              "h-6 text-[10px]",
              r === "high" && "border-destructive/40 text-destructive",
              r === "medium" && "border-amber-500/40 text-amber-700 dark:text-amber-400"
            )}
          >
            Rischio {r === "high" ? "alto" : r === "medium" ? "medio" : "basso"}
          </Badge>
        ))}
        {activeFilter?.onlyMine && (
          <Badge variant="secondary" className="h-6 text-[10px]">
            Solo miei
          </Badge>
        )}
        {activeFilter?.pendingFollowUp && (
          <Badge variant="secondary" className="h-6 text-[10px]">
            Follow-up scaduti
          </Badge>
        )}
      </div>

      {/* Dialog: salva preset */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salva filtro</DialogTitle>
            <DialogDescription>
              Scegli un nome per richiamare velocemente questa configurazione.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="filter-name">Nome</Label>
            <Input
              id="filter-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="es. I miei alto rischio"
              autoFocus
              maxLength={60}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSaveDialog(false)}>
              Annulla
            </Button>
            <Button onClick={handleSave}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: filtro custom */}
      <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Filtro personalizzato</DialogTitle>
            <DialogDescription>
              Combina più criteri. Lascia vuoto per non filtrare quel campo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                Status
              </Label>
              <div className="flex flex-wrap gap-2">
                {APPOINTMENT_STATUS_VALUES.map((s) => {
                  const checked = customDraft.statuses?.includes(s) ?? false;
                  return (
                    <label
                      key={s}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
                        checked && "border-primary bg-primary/5"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setCustomDraft((d) => {
                            const set = new Set(d.statuses ?? []);
                            if (v) set.add(s);
                            else set.delete(s);
                            return { ...d, statuses: Array.from(set) as never };
                          });
                        }}
                      />
                      {APPOINTMENT_STATUS[s as AppointmentStatus]?.label ?? s}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                Livello rischio
              </Label>
              <div className="flex flex-wrap gap-2">
                {RISK_LEVELS.map((r) => {
                  const checked = customDraft.riskLevels?.includes(r) ?? false;
                  return (
                    <label
                      key={r}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
                        checked && "border-primary bg-primary/5"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setCustomDraft((d) => {
                            const set = new Set(d.riskLevels ?? []);
                            if (v) set.add(r);
                            else set.delete(r);
                            return { ...d, riskLevels: Array.from(set) as never };
                          });
                        }}
                      />
                      {r === "high" ? "Alto" : r === "medium" ? "Medio" : "Basso"}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={customDraft.onlyMine ?? false}
                  onCheckedChange={(v) =>
                    setCustomDraft((d) => ({ ...d, onlyMine: !!v }))
                  }
                />
                Solo i miei (assegnati a me)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={customDraft.pendingFollowUp ?? false}
                  onCheckedChange={(v) =>
                    setCustomDraft((d) => ({ ...d, pendingFollowUp: !!v }))
                  }
                />
                Solo follow-up scaduti
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCustomDialog(false)}>
              Annulla
            </Button>
            <Button onClick={applyCustom}>Applica</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
