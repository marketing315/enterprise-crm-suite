import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, UserPlus, Plus, Users } from "lucide-react";
import type { AppRole, Brand } from "@/types/database";

export function AdminManagement() {
  const { brands } = useBrand();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  // Brand creation state
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandSlug, setNewBrandSlug] = useState("");

  // User creation state
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserBrandId, setNewUserBrandId] = useState("");
  const [newUserRole, setNewUserRole] = useState<AppRole>("callcenter");

  // Fetch all users with their roles
  const { data: usersWithRoles, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users-roles"],
    queryFn: async () => {
      // Get all users the admin can see (through their brands)
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select(`
          id,
          role,
          brand_id,
          user:users!user_roles_user_id_fkey(id, email, full_name),
          brand:brands!user_roles_brand_id_fkey(id, name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return roles;
    },
  });

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
      setBrandDialogOpen(false);
      setNewBrandName("");
      setNewBrandSlug("");
      queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  // Create user mutation (calls edge function)
  const createUserMutation = useMutation({
    mutationFn: async (userData: {
      email: string;
      password: string;
      full_name: string;
      brand_id: string;
      role: AppRole;
    }) => {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: userData,
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Utente creato con successo");
      setUserDialogOpen(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserFullName("");
      setNewUserBrandId("");
      setNewUserRole("callcenter");
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
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

  const handleCreateUser = () => {
    if (!newUserEmail.trim() || !newUserPassword.trim() || !newUserFullName.trim() || !newUserBrandId) {
      toast.error("Compila tutti i campi");
      return;
    }
    if (newUserPassword.length < 6) {
      toast.error("La password deve essere di almeno 6 caratteri");
      return;
    }
    createUserMutation.mutate({
      email: newUserEmail,
      password: newUserPassword,
      full_name: newUserFullName,
      brand_id: newUserBrandId,
      role: newUserRole,
    });
  };

  const roleLabels: Record<AppRole, string> = {
    admin: "Admin",
    ceo: "CEO",
    callcenter: "Call Center",
    sales: "Sales",
  };

  const roleColors: Record<AppRole, "default" | "secondary" | "destructive" | "outline"> = {
    admin: "destructive",
    ceo: "default",
    callcenter: "secondary",
    sales: "outline",
  };

  return (
    <div className="space-y-6">
      {/* Actions Row */}
      <div className="flex gap-4">
        {/* Create Brand Dialog */}
        <Dialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Building2 className="h-4 w-4" />
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
              <Button variant="outline" onClick={() => setBrandDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleCreateBrand} disabled={createBrandMutation.isPending}>
                {createBrandMutation.isPending ? "Creazione..." : "Crea Brand"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create User Dialog */}
        <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <UserPlus className="h-4 w-4" />
              Nuovo Utente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crea Nuovo Utente</DialogTitle>
              <DialogDescription>
                Inserisci i dettagli del nuovo utente
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="user-name">Nome Completo</Label>
                <Input
                  id="user-name"
                  value={newUserFullName}
                  onChange={(e) => setNewUserFullName(e.target.value)}
                  placeholder="Es. Mario Rossi"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="mario.rossi@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">Password</Label>
                <Input
                  id="user-password"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Minimo 6 caratteri"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-brand">Brand</Label>
                <Select value={newUserBrandId} onValueChange={setNewUserBrandId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-role">Ruolo</Label>
                <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona ruolo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="ceo">CEO</SelectItem>
                    <SelectItem value="callcenter">Call Center</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUserDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Creazione..." : "Crea Utente"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Brands List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Brand ({brands.length})
          </CardTitle>
          <CardDescription>Elenco dei brand nel sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Auto-Assign</TableHead>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Utenti e Ruoli
          </CardTitle>
          <CardDescription>Elenco degli utenti con i loro ruoli per brand</CardDescription>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="text-center py-4 text-muted-foreground">Caricamento...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utente</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Ruolo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersWithRoles?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {(entry.user as any)?.full_name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(entry.user as any)?.email}
                    </TableCell>
                    <TableCell>{(entry.brand as any)?.name}</TableCell>
                    <TableCell>
                      <Badge variant={roleColors[entry.role as AppRole]}>
                        {roleLabels[entry.role as AppRole]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
