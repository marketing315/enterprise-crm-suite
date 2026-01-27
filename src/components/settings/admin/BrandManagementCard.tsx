import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import type { Brand } from "@/types/database";

interface BrandManagementCardProps {
  brands: Brand[];
}

export function BrandManagementCard({ brands }: BrandManagementCardProps) {
  const queryClient = useQueryClient();

  // Create brand state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandSlug, setNewBrandSlug] = useState("");

  // Edit brand state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editBrandName, setEditBrandName] = useState("");
  const [editBrandSlug, setEditBrandSlug] = useState("");
  const [editAutoAssign, setEditAutoAssign] = useState(true);

  // Create brand mutation
  const createBrandMutation = useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
      const { data, error } = await supabase
        .from("brands")
        .insert({ name, slug })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Brand creato con successo");
      setCreateDialogOpen(false);
      setNewBrandName("");
      setNewBrandSlug("");
      queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  // Update brand mutation
  const updateBrandMutation = useMutation({
    mutationFn: async ({ id, name, slug, auto_assign_enabled }: { id: string; name: string; slug: string; auto_assign_enabled: boolean }) => {
      const { error } = await supabase
        .from("brands")
        .update({ name, slug, auto_assign_enabled })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Brand aggiornato con successo");
      setEditDialogOpen(false);
      setEditingBrand(null);
      queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  // Delete brand mutation
  const deleteBrandMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("brands")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Brand eliminato con successo");
      queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  const handleCreateBrand = () => {
    if (!newBrandName.trim() || !newBrandSlug.trim()) {
      toast.error("Compila tutti i campi");
      return;
    }
    createBrandMutation.mutate({ name: newBrandName, slug: newBrandSlug });
  };

  const handleEditBrand = (brand: Brand) => {
    setEditingBrand(brand);
    setEditBrandName(brand.name);
    setEditBrandSlug(brand.slug);
    setEditAutoAssign(brand.auto_assign_enabled);
    setEditDialogOpen(true);
  };

  const handleUpdateBrand = () => {
    if (!editingBrand || !editBrandName.trim() || !editBrandSlug.trim()) {
      toast.error("Compila tutti i campi");
      return;
    }
    updateBrandMutation.mutate({
      id: editingBrand.id,
      name: editBrandName,
      slug: editBrandSlug,
      auto_assign_enabled: editAutoAssign,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Brand ({brands.length})
            </CardTitle>
            <CardDescription>Gestisci i brand nel sistema</CardDescription>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Nuovo Brand
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crea Nuovo Brand</DialogTitle>
                <DialogDescription>
                  Inserisci i dettagli del nuovo brand
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="brand-name">Nome Brand</Label>
                  <Input
                    id="brand-name"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="Es. Acme Corp"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand-slug">Slug</Label>
                  <Input
                    id="brand-slug"
                    value={newBrandSlug}
                    onChange={(e) => setNewBrandSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                    placeholder="es. acme-corp"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Annulla
                </Button>
                <Button onClick={handleCreateBrand} disabled={createBrandMutation.isPending}>
                  {createBrandMutation.isPending ? "Creazione..." : "Crea Brand"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Auto-Assign</TableHead>
              <TableHead className="w-[100px]">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((brand) => (
              <TableRow key={brand.id}>
                <TableCell className="font-medium">{brand.name}</TableCell>
                <TableCell className="text-muted-foreground">{brand.slug}</TableCell>
                <TableCell>
                  <Badge variant={brand.auto_assign_enabled ? "default" : "secondary"}>
                    {brand.auto_assign_enabled ? "Attivo" : "Disattivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditBrand(brand)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare il brand?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Questa azione eliminerà definitivamente il brand "{brand.name}" e tutti i dati associati. L'azione non può essere annullata.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteBrandMutation.mutate(brand.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Edit Brand Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifica Brand</DialogTitle>
              <DialogDescription>
                Modifica i dettagli del brand
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-brand-name">Nome Brand</Label>
                <Input
                  id="edit-brand-name"
                  value={editBrandName}
                  onChange={(e) => setEditBrandName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-brand-slug">Slug</Label>
                <Input
                  id="edit-brand-slug"
                  value={editBrandSlug}
                  onChange={(e) => setEditBrandSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-Assign Tickets</Label>
                  <p className="text-sm text-muted-foreground">
                    Assegna automaticamente i ticket agli operatori
                  </p>
                </div>
                <Switch
                  checked={editAutoAssign}
                  onCheckedChange={setEditAutoAssign}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleUpdateBrand} disabled={updateBrandMutation.isPending}>
                {updateBrandMutation.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
