import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Users, UserPlus, Pencil, Trash2, Plus, Search,
  Shield, Crown, Headphones, TrendingUp, Building2,
  ChevronDown, ChevronUp, MoreHorizontal
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { AppRole, Brand } from "@/types/database";

interface UserManagementCardProps {
  brands: Brand[];
}

interface UserRoleEntry {
  id: string;
  role: string;
  brand_id: string;
  user: { id: string; email: string; full_name: string | null } | null;
  brand: { id: string; name: string } | null;
}

interface GroupedUser {
  id: string;
  email: string;
  full_name: string | null;
  roles: { id: string; brand_id: string; brand_name: string; role: AppRole }[];
}

// --- Role config ---
const ROLE_CONFIG: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  admin: { label: "Admin", icon: Shield, color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800" },
  ceo: { label: "CEO", icon: Crown, color: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800" },
  amministrazione: { label: "Amministrazione", icon: Building2, color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" },
  responsabile_venditori: { label: "Resp. Venditori", icon: TrendingUp, color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" },
  responsabile_callcenter: { label: "Resp. Call Center", icon: Headphones, color: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800" },
  venditore: { label: "Venditore", icon: TrendingUp, color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800" },
  operatore_callcenter: { label: "Op. Call Center", icon: Headphones, color: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800" },
  callcenter: { label: "Call Center", icon: Headphones, color: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800" },
  sales: { label: "Sales", icon: TrendingUp, color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800" },
};

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  }
  return email.slice(0, 2).toUpperCase();
}

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] || { label: role, icon: Users, color: "bg-muted text-muted-foreground border-border" };
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// --- Available roles for select ---
const AVAILABLE_ROLES: { value: AppRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "ceo", label: "CEO" },
  { value: "amministrazione", label: "Amministrazione" },
  { value: "responsabile_venditori", label: "Resp. Venditori" },
  { value: "responsabile_callcenter", label: "Resp. Call Center" },
  { value: "venditore", label: "Venditore" },
  { value: "operatore_callcenter", label: "Op. Call Center" },
];

export function UserManagementCard({ brands }: UserManagementCardProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Create user state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserBrandIds, setNewUserBrandIds] = useState<string[]>([]);
  const [newUserRole, setNewUserRole] = useState<AppRole>("operatore_callcenter");

  // Edit user state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<GroupedUser | null>(null);
  const [editUserFullName, setEditUserFullName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editAddBrandId, setEditAddBrandId] = useState("");
  const [editAddRole, setEditAddRole] = useState<AppRole>("operatore_callcenter");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [editConfirmPassword, setEditConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Fetch users with roles
  const { data: usersWithRoles, isLoading } = useQuery({
    queryKey: ["admin-users-roles"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select(`
          id, role, brand_id,
          user:users!user_roles_user_id_fkey(id, email, full_name),
          brand:brands!user_roles_brand_id_fkey(id, name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return roles as unknown as UserRoleEntry[];
    },
  });

  // Group by user
  const groupedUsers = useMemo<GroupedUser[]>(() => {
    if (!usersWithRoles) return [];
    const map = new Map<string, GroupedUser>();
    for (const entry of usersWithRoles) {
      if (!entry.user) continue;
      const uid = entry.user.id;
      if (!map.has(uid)) {
        map.set(uid, { id: uid, email: entry.user.email, full_name: entry.user.full_name, roles: [] });
      }
      map.get(uid)!.roles.push({
        id: entry.id,
        brand_id: entry.brand_id,
        brand_name: entry.brand?.name || "—",
        role: entry.role as AppRole,
      });
    }
    return Array.from(map.values());
  }, [usersWithRoles]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return groupedUsers.filter(user => {
      const matchesSearch = !search ||
        user.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || user.roles.some(r => r.role === roleFilter);
      const matchesBrand = brandFilter === "all" || user.roles.some(r => r.brand_id === brandFilter);
      return matchesSearch && matchesRole && matchesBrand;
    });
  }, [groupedUsers, search, roleFilter, brandFilter]);

  // Stats
  const stats = useMemo(() => ({
    totalUsers: groupedUsers.length,
    admins: groupedUsers.filter(u => u.roles.some(r => r.role === "admin")).length,
    totalRoles: usersWithRoles?.length || 0,
  }), [groupedUsers, usersWithRoles]);

  // --- Mutations ---
  const createUserMutation = useMutation({
    mutationFn: async (userData: { email: string; password: string; full_name: string; brand_ids: string[]; role: AppRole }) => {
      const { data, error } = await supabase.functions.invoke("admin-create-user", { body: userData });
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
    onError: (error: Error) => toast.error(`Errore: ${error.message}`),
  });

  const updateUserMutation = useMutation({
    mutationFn: async (userData: { user_id: string; full_name?: string; email?: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", { body: { action: "update", ...userData } });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Utente aggiornato");
      setEditDialogOpen(false);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
    },
    onError: (error: Error) => toast.error(`Errore: ${error.message}`),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", { body: { action: "delete", user_id: userId } });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Utente eliminato");
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
    },
    onError: (error: Error) => toast.error(`Errore: ${error.message}`),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ role_id, role }: { role_id: string; role: AppRole }) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", { body: { action: "update_role", role_id, role } });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Ruolo aggiornato");
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
    },
    onError: (error: Error) => toast.error(`Errore: ${error.message}`),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", { body: { action: "delete_role", role_id: roleId } });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Ruolo rimosso");
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
    },
    onError: (error: Error) => toast.error(`Errore: ${error.message}`),
  });

  const addRoleMutation = useMutation({
    mutationFn: async ({ user_id, brand_id, role }: { user_id: string; brand_id: string; role: AppRole }) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", { body: { action: "add_role", user_id, brand_id, role } });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Ruolo aggiunto");
      setEditAddBrandId("");
      setEditAddRole("operatore_callcenter");
      queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] });
    },
    onError: (error: Error) => toast.error(`Errore: ${error.message}`),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ user_id, new_password }: { user_id: string; new_password: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", { body: { action: "reset_password", user_id, new_password } });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Password aggiornata con successo");
      setEditNewPassword("");
    },
    onError: (error: Error) => toast.error(`Errore: ${error.message}`),
  });

  // --- Helpers ---
  const resetCreateForm = () => {
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserFullName("");
    setNewUserBrandIds([]);
    setNewUserRole("operatore_callcenter");
  };

  const toggleBrandSelection = (brandId: string) => {
    setNewUserBrandIds(prev => prev.includes(brandId) ? prev.filter(id => id !== brandId) : [...prev, brandId]);
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
    createUserMutation.mutate({ email: newUserEmail, password: newUserPassword, full_name: newUserFullName, brand_ids: newUserBrandIds, role: newUserRole });
  };

  const openEditDialog = (user: GroupedUser) => {
    setEditingUser(user);
    setEditUserFullName(user.full_name || "");
    setEditUserEmail(user.email);
    setEditAddBrandId("");
    setEditAddRole("operatore_callcenter");
    setEditNewPassword("");
    setEditConfirmPassword("");
    setShowPassword(false);
    setEditDialogOpen(true);
  };

  const getAvailableBrandsForEdit = () => {
    if (!editingUser) return [];
    const assignedBrandIds = editingUser.roles.map(r => r.brand_id);
    return brands.filter(b => !assignedBrandIds.includes(b.id));
  };

  const handleAddRoleToEditUser = () => {
    if (!editAddBrandId || !editingUser) return;
    addRoleMutation.mutate({ user_id: editingUser.id, brand_id: editAddBrandId, role: editAddRole });
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;
    updateUserMutation.mutate({ user_id: editingUser.id, full_name: editUserFullName, email: editUserEmail });
  };

  const nonSystemBrands = brands.filter(b => b.id !== "00000000-0000-0000-0000-000000000000");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Utenti e Ruoli</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {stats.totalUsers} utenti · {stats.totalRoles} assegnazioni
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 shadow-sm">
              <UserPlus className="h-4 w-4" />
              Nuovo Utente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Crea Nuovo Utente</DialogTitle>
              <DialogDescription>Inserisci i dettagli del nuovo membro del team</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="user-name">Nome Completo</Label>
                <Input id="user-name" value={newUserFullName} onChange={e => setNewUserFullName(e.target.value)} placeholder="Es. Mario Rossi" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input id="user-email" type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="mario.rossi@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">Password</Label>
                <Input id="user-password" type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="Minimo 6 caratteri" />
              </div>
              <div className="space-y-2">
                <Label>Brand</Label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-3 max-h-36 overflow-y-auto">
                  {nonSystemBrands.map(brand => (
                    <label key={brand.id} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 transition-colors hover:bg-accent">
                      <Checkbox checked={newUserBrandIds.includes(brand.id)} onCheckedChange={() => toggleBrandSelection(brand.id)} />
                      <span className="text-sm">{brand.name}</span>
                    </label>
                  ))}
                </div>
                {newUserBrandIds.length > 0 && <p className="text-xs text-muted-foreground">{newUserBrandIds.length} brand selezionati</p>}
              </div>
              <div className="space-y-2">
                <Label>Ruolo</Label>
                <Select value={newUserRole} onValueChange={v => setNewUserRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Annulla</Button>
              <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Creazione..." : "Crea Utente"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-44 h-9">
            <SelectValue placeholder="Tutti i ruoli" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i ruoli</SelectItem>
            {AVAILABLE_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-full sm:w-44 h-9">
            <SelectValue placeholder="Tutti i brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i brand</SelectItem>
            {nonSystemBrands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* User List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              {search || roleFilter !== "all" || brandFilter !== "all"
                ? "Nessun utente corrisponde ai filtri"
                : "Nessun utente trovato"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map(user => {
            const isExpanded = expandedUserId === user.id;
            const primaryRole = user.roles[0];
            const uniqueRoles = [...new Set(user.roles.map(r => r.role))];
            const uniqueBrands = [...new Set(user.roles.map(r => r.brand_name))];

            return (
              <Card
                key={user.id}
                className="overflow-hidden transition-all duration-200 hover:shadow-sm border-border/60"
              >
                {/* Main row */}
                <div
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                      {getInitials(user.full_name, user.email)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-foreground">
                      {user.full_name || user.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>

                  {/* Role badges - show on desktop */}
                  <div className="hidden md:flex items-center gap-1.5 flex-wrap justify-end max-w-[280px]">
                    {uniqueRoles.map(role => <RoleBadge key={role} role={role} />)}
                  </div>

                  {/* Brand count */}
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>{uniqueBrands.length}</span>
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={e => e.stopPropagation()}>
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Azioni</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(user)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Modifica utente
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={e => e.preventDefault()}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Elimina utente
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare l&apos;utente?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Questa azione eliminerà definitivamente &quot;{user.full_name || user.email}&quot; e tutti i suoi ruoli.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteUserMutation.mutate(user.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Elimina
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Expand indicator */}
                  <div className="shrink-0">
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border/50 bg-muted/20 px-4 py-3 space-y-3">
                    {/* Mobile role badges */}
                    <div className="flex flex-wrap gap-1.5 md:hidden">
                      {uniqueRoles.map(role => <RoleBadge key={role} role={role} />)}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assegnazioni</p>
                      {user.roles.map(role => (
                        <div key={role.id} className="flex items-center justify-between gap-2 rounded-lg bg-background border border-border/50 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate">{role.brand_name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <RoleBadge role={role.role} />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span className="sr-only">Rimuovi ruolo</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Rimuovere questo ruolo?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Rimuovendo il ruolo &quot;{ROLE_CONFIG[role.role]?.label || role.role}&quot; per &quot;{role.brand_name}&quot;, l&apos;utente perderà l&apos;accesso.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteRoleMutation.mutate(role.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Rimuovi
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica Utente</DialogTitle>
            <DialogDescription className="sr-only">Aggiorna dati, password e ruoli</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-6 py-1">
              {/* User identity header */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/50">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                    {getInitials(editingUser.full_name, editingUser.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{editingUser.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{editingUser.email}</p>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {[...new Set(editingUser.roles.map(r => r.role))].map(role => (
                      <RoleBadge key={role} role={role} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Dati personali */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dati Personali</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-user-name" className="text-xs">Nome Completo</Label>
                    <Input id="edit-user-name" value={editUserFullName} onChange={e => setEditUserFullName(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-user-email" className="text-xs">Email</Label>
                    <Input id="edit-user-email" type="email" value={editUserEmail} onChange={e => setEditUserEmail(e.target.value)} className="h-9" />
                  </div>
                </div>
              </section>

              <Separator />

              {/* Sicurezza — Password */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sicurezza</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-user-password" className="text-xs">Nuova Password</Label>
                    <div className="relative">
                      <Input
                        id="edit-user-password"
                        type={showPassword ? "text" : "password"}
                        value={editNewPassword}
                        onChange={e => setEditNewPassword(e.target.value)}
                        placeholder="Min. 6 caratteri"
                        className="h-9 pr-9"
                      />
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="absolute right-0 top-0 h-full w-9 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(v => !v)}
                      >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-user-confirm-password" className="text-xs">Conferma Password</Label>
                    <Input
                      id="edit-user-confirm-password"
                      type={showPassword ? "text" : "password"}
                      value={editConfirmPassword}
                      onChange={e => setEditConfirmPassword(e.target.value)}
                      placeholder="Ripeti la password"
                      className="h-9"
                    />
                  </div>
                </div>
                {editNewPassword && editNewPassword.length < 6 && (
                  <p className="text-xs text-destructive">La password deve essere di almeno 6 caratteri</p>
                )}
                {editNewPassword && editConfirmPassword && editNewPassword !== editConfirmPassword && (
                  <p className="text-xs text-destructive">Le password non coincidono</p>
                )}
                {editNewPassword.length >= 6 && editNewPassword === editConfirmPassword && (
                  <Button
                    size="sm" variant="outline" className="gap-2"
                    disabled={resetPasswordMutation.isPending}
                    onClick={() => {
                      if (editingUser) {
                        resetPasswordMutation.mutate({ user_id: editingUser.id, new_password: editNewPassword });
                        setEditConfirmPassword("");
                      }
                    }}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    {resetPasswordMutation.isPending ? "Aggiornamento..." : "Aggiorna Password"}
                  </Button>
                )}
              </section>

              <Separator />

              {/* Ruoli assegnati */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ruoli & Brand</h3>
                  <span className="text-xs text-muted-foreground">{editingUser.roles.length} assegnazion{editingUser.roles.length === 1 ? "e" : "i"}</span>
                </div>

                <div className="space-y-2">
                  {editingUser.roles.map(role => {
                    const brand = brands.find(b => b.id === role.brand_id);
                    const roleConfig = ROLE_CONFIG[role.role];
                    const RoleIcon = roleConfig?.icon || Users;
                    return (
                      <div key={role.id} className="group flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5 transition-colors hover:border-border">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${roleConfig?.color || "bg-muted text-muted-foreground"}`}>
                          <RoleIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{brand?.name || role.brand_name}</p>
                        </div>
                        <Select
                          value={role.role}
                          onValueChange={v => updateRoleMutation.mutate({ role_id: role.id, role: v as AppRole })}
                        >
                          <SelectTrigger className="w-40 h-8 text-xs border-border/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                          onClick={() => deleteRoleMutation.mutate(role.id)}
                          disabled={deleteRoleMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                  {editingUser.roles.length === 0 && (
                    <div className="flex items-center justify-center py-6 rounded-lg border border-dashed border-border/60 bg-muted/20">
                      <p className="text-sm text-muted-foreground">Nessun ruolo assegnato</p>
                    </div>
                  )}
                </div>

                {/* Add new role */}
                {getAvailableBrandsForEdit().length > 0 && (
                  <div className="flex items-end gap-2 pt-1 rounded-lg border border-dashed border-border/40 p-3 bg-muted/10">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">Aggiungi a brand</Label>
                      <Select value={editAddBrandId} onValueChange={setEditAddBrandId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                        <SelectContent>
                          {getAvailableBrandsForEdit().map(brand => (
                            <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-40 space-y-1">
                      <Label className="text-xs text-muted-foreground">Con ruolo</Label>
                      <Select value={editAddRole} onValueChange={v => setEditAddRole(v as AppRole)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" className="h-9 gap-1.5" onClick={handleAddRoleToEditUser} disabled={!editAddBrandId || addRoleMutation.isPending}>
                      <Plus className="h-3.5 w-3.5" />
                      Aggiungi
                    </Button>
                  </div>
                )}
              </section>

              <Separator />

              {/* Danger zone */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-destructive/70 uppercase tracking-wider">Zona Pericolosa</h3>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/20 hover:bg-destructive/5 hover:border-destructive/40 gap-2">
                      <Trash2 className="h-3.5 w-3.5" />
                      Elimina Utente Definitivamente
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminare l&apos;utente?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Questa azione eliminerà definitivamente &quot;{editingUser.full_name || editingUser.email}&quot; e tutti i suoi ruoli. Non è reversibile.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          deleteUserMutation.mutate(editingUser.id);
                          setEditDialogOpen(false);
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Elimina
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </section>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleUpdateUser} disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending ? "Salvataggio..." : "Salva Modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
