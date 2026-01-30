import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  MoreHorizontal, 
  UserCheck, 
  UserX, 
  Edit, 
  Loader2,
  Users,
  Filter,
} from 'lucide-react';
import { 
  useTeamMembers, 
  useUpdateTeamMember,
  useAssignableRoles,
  ROLE_LABELS,
  ROLE_COLORS,
  type TeamMember,
} from '@/hooks/useTeam';
import type { AppRole } from '@/types/database';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface TeamMembersTableProps {
  roleFilter?: AppRole;
  showInactive?: boolean;
  onFilterChange?: (role: AppRole | undefined) => void;
  onShowInactiveChange?: (show: boolean) => void;
}

export function TeamMembersTable({
  roleFilter,
  showInactive = false,
  onFilterChange,
  onShowInactiveChange,
}: TeamMembersTableProps) {
  const { data: members = [], isLoading, error } = useTeamMembers(roleFilter, !showInactive);
  const { data: assignableRoles = [] } = useAssignableRoles();
  const updateMutation = useUpdateTeamMember();
  
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<AppRole | ''>('');

  const handleToggleActive = async (member: TeamMember) => {
    await updateMutation.mutateAsync({
      membership_id: member.membership_id,
      is_active: !member.is_active,
    });
  };

  const handleRoleChange = async (member: TeamMember) => {
    if (!newRole || newRole === member.role) {
      setEditingMember(null);
      setNewRole('');
      return;
    }

    await updateMutation.mutateAsync({
      membership_id: member.membership_id,
      new_role: newRole as AppRole,
    });

    setEditingMember(null);
    setNewRole('');
  };

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Errore nel caricamento: {error.message}
      </div>
    );
  }

  // All available roles for filter
  const filterRoles: { value: AppRole; label: string }[] = [
    { value: 'ceo', label: 'CEO' },
    { value: 'responsabile_venditori', label: 'Resp. Venditori' },
    { value: 'responsabile_callcenter', label: 'Resp. Call Center' },
    { value: 'venditore', label: 'Venditore' },
    { value: 'operatore_callcenter', label: 'Operatore Call Center' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select 
            value={roleFilter || 'all'} 
            onValueChange={(v) => onFilterChange?.(v === 'all' ? undefined : v as AppRole)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tutti i ruoli" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i ruoli</SelectItem>
              {filterRoles.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => onShowInactiveChange?.(e.target.checked)}
            className="rounded border-input"
          />
          Mostra disattivati
        </label>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utente</TableHead>
              <TableHead>Ruolo</TableHead>
              <TableHead className="hidden md:table-cell">Stato</TableHead>
              <TableHead className="hidden md:table-cell">Data aggiunta</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Users className="h-8 w-8" />
                    <p>Nessun membro trovato</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              members.map((member) => (
                <TableRow 
                  key={member.membership_id}
                  className={!member.is_active ? 'opacity-50' : ''}
                >
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {member.full_name || 'N/D'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {member.email}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {editingMember === member.membership_id ? (
                      <div className="flex items-center gap-2">
                        <Select 
                          value={newRole || member.role} 
                          onValueChange={(v) => setNewRole(v as AppRole)}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {assignableRoles.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button 
                          size="sm" 
                          onClick={() => handleRoleChange(member)}
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Salva'
                          )}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => {
                            setEditingMember(null);
                            setNewRole('');
                          }}
                        >
                          Annulla
                        </Button>
                      </div>
                    ) : (
                      <Badge className={ROLE_COLORS[member.role]}>
                        {ROLE_LABELS[member.role]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={member.is_active ? 'default' : 'secondary'}>
                      {member.is_active ? 'Attivo' : 'Disattivato'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {format(new Date(member.created_at), 'd MMM yyyy', { locale: it })}
                  </TableCell>
                  <TableCell>
                    {member.can_edit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditingMember(member.membership_id);
                              setNewRole(member.role);
                            }}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Cambia ruolo
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(member)}
                            disabled={updateMutation.isPending}
                          >
                            {member.is_active ? (
                              <>
                                <UserX className="mr-2 h-4 w-4" />
                                Disattiva
                              </>
                            ) : (
                              <>
                                <UserCheck className="mr-2 h-4 w-4" />
                                Riattiva
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
