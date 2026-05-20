import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  useCampaignGroups,
  useCreateCampaignGroup,
  useUpdateCampaignGroup,
  useDeleteCampaignGroup,
  type CampaignGroup,
  type CampaignGroupMatchRules,
} from "@/hooks/useCampaignGroups";

export function CampaignGroupsManager() {
  const { data: groups, isLoading } = useCampaignGroups();
  const createGroup = useCreateCampaignGroup();
  const updateGroup = useUpdateCampaignGroup();
  const deleteGroup = useDeleteCampaignGroup();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignGroup | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(0);
  const [sourceNames, setSourceNames] = useState("");
  const [tags, setTags] = useState("");
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => {
    setName("");
    setPriority(0);
    setSourceNames("");
    setTags("");
    setIsActive(true);
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (g: CampaignGroup) => {
    setEditing(g);
    setName(g.name);
    setPriority(g.priority);
    setSourceNames((g.match_rules.source_names ?? []).join(", "));
    setTags((g.match_rules.tags ?? []).join(", "));
    setIsActive(g.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nome obbligatorio");
      return;
    }

    const rules: CampaignGroupMatchRules = {
      source_names: sourceNames
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      tags: tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      if (editing) {
        await updateGroup.mutateAsync({
          id: editing.id,
          name: name.trim(),
          priority,
          match_rules: rules,
          is_active: isActive,
        });
        toast.success("Gruppo aggiornato");
      } else {
        await createGroup.mutateAsync({
          name: name.trim(),
          priority,
          match_rules: rules,
          is_active: isActive,
        });
        toast.success("Gruppo creato");
      }
      setDialogOpen(false);
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGroup.mutateAsync(id);
      toast.success("Gruppo eliminato");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Gruppi Campagna (Attribution Rules)
        </CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Nuovo Gruppo
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !groups || groups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nessun gruppo configurato. I lead senza campaign_id resteranno unmapped.
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between border rounded-md p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{g.name}</span>
                    <Badge variant={g.is_active ? "default" : "outline"} className="text-xs">
                      P{g.priority}
                    </Badge>
                    {!g.is_active && (
                      <Badge variant="secondary" className="text-xs">
                        Disattivo
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(g.match_rules.source_names ?? []).map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">
                        src:{s}
                      </Badge>
                    ))}
                    {(g.match_rules.tags ?? []).map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">
                        tag:{t}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() = aria-label="Modifica"> openEdit(g)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() = aria-label="Elimina"> handleDelete(g.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifica Gruppo" : "Nuovo Gruppo Campagna"}
            </DialogTitle>
          <DialogDescription className="sr-only">Finestra di dialogo</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Priorità (numero più alto = prima)</Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Source Names (separati da virgola)</Label>
              <Input
                value={sourceNames}
                onChange={(e) => setSourceNames(e.target.value)}
                placeholder="wordpress, fibromialgia, meta"
              />
            </div>
            <div>
              <Label>Tags (separati da virgola)</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="retargeting, lookalike"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Attivo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              disabled={createGroup.isPending || updateGroup.isPending}
            >
              {editing ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
