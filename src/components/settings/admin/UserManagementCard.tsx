import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Users, UserPlus, Pencil, Trash2, Plus } from "lucide-react";
import type { AppRole, Brand } from "@/types/database";
interface UserManagementCardProps {
  brands: Brand[];
}

interface UserRoleEntry {
  id: string;
  role: string;
  brand_id: string;
  user: {
    id: string;
    email: string;
    full_name: string | null;
  };
  brand: {
    id: string;
    name: string;
  };
}

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

export function UserManagementCard({ brands }: UserManagementCardProps) {
  const queryClient = useQueryClient();

  // Create user state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserBrandIds, setNewUserBrandIds] = useState<string[]>([]);
  const [newUserRole, setNewUserRole] = useState<AppRole>("callcenter");

  // Edit user state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: string; email: string; full_name: string | null } | null>(null);
  const [editUserFullName, setEditUserFullName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");

  // Edit role state
  const [editRoleDialogOpen, setEditRoleDialogOpen] = useState(false);
  const [editingRoleEntry, setEditingRoleEntry] = useState<UserRoleEntry | null>(null);
  const [editRoleValue, setEditRoleValue] = useState<AppRole>("callcenter");

  // Add role state
  const [addRoleDialogOpen, setAddRoleDialogOpen] = useState(false);
  const [addRoleUserId, setAddRoleUserId] = useState("");
  const [addRoleBrandId, setAddRoleBrandId] = useState("");
  const [addRoleValue, setAddRoleValue] = useState<AppRole>("callcenter");

  // Fetch users with roles
  const { data: usersWithRoles, isLoading } = useQuery({
    queryKey: ["admin-users-roles"],
    queryFn: async () => {
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
      return roles as unknown as UserRoleEntry[];
    },
  });

  // Get unique users for the add role dropdown
  const uniqueUsers = usersWithRoles?.reduce((acc, entry) => {
    if (!acc.find(u => u.id === entry.user.id)) {
      acc.push(entry.user);
    }
    return acc;
  }, [] as { id: string; email: string; full_name: string | null }[]) || [];

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: {
      email: string;
      password: string;
      full_name: string;
      brand_ids: string[];
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
      setCreateDialogOpen(false);
      resetCreateForm();
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (userData: { user_id: string; full_name?: string; email?: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "update", ...userData },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Utente aggiornato con successo");
      setEditDialogOpen(false);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "delete", user_id: userId },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Utente eliminato con successo");
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ role_id, role }: { role_id: string; role: AppRole }) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "update_role", role_id, role },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Ruolo aggiornato con successo");
      setEditRoleDialogOpen(false);
      setEditingRoleEntry(null);
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  // Delete role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "delete_role", role_id: roleId },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Ruolo rimosso con successo");
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  // Add role mutation
  const addRoleMutation = useMutation({
    mutationFn: async ({ user_id, brand_id, role }: { user_id: string; brand_id: string; role: AppRole }) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "add_role", user_id, brand_id, role },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Ruolo aggiunto con successo");
      setAddRoleDialogOpen(false);
      setAddRoleUserId("");
      setAddRoleBrandId("");
      setAddRoleValue("callcenter");
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  const resetCreateForm = () => {
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserFullName("");
    setNewUserBrandIds([]);
    setNewUserRole("callcenter");
  };

  const toggleBrandSelection = (brandId: string) => {
    setNewUserBrandIds((prev) =>
      prev.includes(brandId)
        ? prev.filter((id) => id !== brandId)
        : [...prev, brandId]
    );
  };

  const handleCreateUser = () => {
    if (!newUserEmail.trim() || !newUserPassword.trim() || !newUserFullName.trim() || newUserBrandIds.length === 0) {
      toast.error("Compila tutti i campi e seleziona almeno un brand");
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
      brand_ids: newUserBrandIds,
      role: newUserRole,
    });
  };

  const handleEditUser = (user: { id: string; email: string; full_name: string | null }) => {
    setEditingUser(user);
    setEditUserFullName(user.full_name || "");
    setEditUserEmail(user.email);
    setEditDialogOpen(true);
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;
    updateUserMutation.mutate({
      user_id: editingUser.id,
      full_name: editUserFullName,
      email: editUserEmail,
    });
  };

  const handleEditRole = (entry: UserRoleEntry) => {
    setEditingRoleEntry(entry);
    setEditRoleValue(entry.role as AppRole);
    setEditRoleDialogOpen(true);
  };

  const handleUpdateRole = () => {
    if (!editingRoleEntry) return;
    updateRoleMutation.mutate({
      role_id: editingRoleEntry.id,
      role: editRoleValue,
    });
  };

  const handleAddRole = () => {
    if (!addRoleUserId || !addRoleBrandId) {
      toast.error("Seleziona utente e brand");
      return;
    }
    addRoleMutation.mutate({
      user_id: addRoleUserId,
      brand_id: addRoleBrandId,
      role: addRoleValue,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Utenti e Ruoli
            </CardTitle>
            <CardDescription>Gestisci gli utenti e i loro ruoli per brand</CardDescription>
          </div>
          <div className="flex gap-2">
            <Dialog open={addRoleDialogOpen} onOpenChange={setAddRoleDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Aggiungi Ruolo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Aggiungi Ruolo</DialogTitle>
                  <DialogDescription>
                    Assegna un nuovo ruolo a un utente esistente
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Utente</Label>
                    <Select value={addRoleUserId} onValueChange={setAddRoleUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona utente" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.full_name || user.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Brand</Label>
                    <Select value={addRoleBrandId} onValueChange={setAddRoleBrandId}>
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
                    <Label>Ruolo</Label>
                    <Select value={addRoleValue} onValueChange={(v) => setAddRoleValue(v as AppRole)}>
                      <SelectTrigger>
                        <SelectValue />
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
                  <Button variant="outline" onClick={() => setAddRoleDialogOpen(false)}>
                    Annulla
                  </Button>
                  <Button onClick={handleAddRole} disabled={addRoleMutation.isPending}>
                    {addRoleMutation.isPending ? "Aggiunta..." : "Aggiungi Ruolo"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
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
                    <Label>Brand (seleziona uno o più)</Label>
                    <div className="grid grid-cols-2 gap-2 border rounded-md p-3 max-h-40 overflow-y-auto">
                      {brands.map((brand) => (
                        <div key={brand.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`brand-${brand.id}`}
                            checked={newUserBrandIds.includes(brand.id)}
                            onCheckedChange={() => toggleBrandSelection(brand.id)}
                          />
                          <Label
                            htmlFor={`brand-${brand.id}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {brand.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {newUserBrandIds.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {newUserBrandIds.length} brand selezionati
                      </p>
                    )}
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
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Annulla
                  </Button>
                  <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
                    {createUserMutation.isPending ? "Creazione..." : "Crea Utente"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">Caricamento...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utente</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead className="w-[120px]">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersWithRoles?.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    {entry.user?.full_name || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.user?.email}
                  </TableCell>
                  <TableCell>{entry.brand?.name}</TableCell>
                  <TableCell>
                    <Badge variant={roleColors[entry.role as AppRole]}>
                      {roleLabels[entry.role as AppRole]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditUser(entry.user)}
                        title="Modifica utente"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditRole(entry)}
                        title="Modifica ruolo"
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Rimuovi ruolo">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Rimuovere questo ruolo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Stai per rimuovere il ruolo "{roleLabels[entry.role as AppRole]}" per il brand "{entry.brand?.name}". 
                              L'utente perderà l'accesso a questo brand.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteRoleMutation.mutate(entry.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Rimuovi Ruolo
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
        )}

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifica Utente</DialogTitle>
              <DialogDescription>
                Modifica i dettagli dell'utente
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-user-name">Nome Completo</Label>
                <Input
                  id="edit-user-name"
                  value={editUserFullName}
                  onChange={(e) => setEditUserFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-user-email">Email</Label>
                <Input
                  id="edit-user-email"
                  type="email"
                  value={editUserEmail}
                  onChange={(e) => setEditUserEmail(e.target.value)}
                />
              </div>
              <div className="pt-4 border-t">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full gap-2">
                      <Trash2 className="h-4 w-4" />
                      Elimina Utente
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminare l'utente?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Questa azione eliminerà definitivamente l'utente "{editingUser?.full_name || editingUser?.email}" 
                        e tutti i suoi ruoli. L'azione non può essere annullata.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          if (editingUser) {
                            deleteUserMutation.mutate(editingUser.id);
                            setEditDialogOpen(false);
                          }
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Elimina
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleUpdateUser} disabled={updateUserMutation.isPending}>
                {updateUserMutation.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Role Dialog */}
        <Dialog open={editRoleDialogOpen} onOpenChange={setEditRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifica Ruolo</DialogTitle>
              <DialogDescription>
                Modifica il ruolo di {editingRoleEntry?.user?.full_name || editingRoleEntry?.user?.email} 
                per il brand {editingRoleEntry?.brand?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Ruolo</Label>
                <Select value={editRoleValue} onValueChange={(v) => setEditRoleValue(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
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
              <Button variant="outline" onClick={() => setEditRoleDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleUpdateRole} disabled={updateRoleMutation.isPending}>
                {updateRoleMutation.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
