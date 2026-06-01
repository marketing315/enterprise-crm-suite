import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, UserCheck, UserX, RefreshCw, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { AppRole } from '@/types/database';

interface PendingUser {
  id: string;
  supabase_auth_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  provider: string;
}

interface Brand {
  id: string;
  name: string;
}

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'ceo', label: 'CEO' },
  { value: 'amministrazione', label: 'Amministrazione' },
  { value: 'responsabile_venditori', label: 'Responsabile Venditori' },
  { value: 'responsabile_callcenter', label: 'Responsabile Call Center' },
  { value: 'venditore', label: 'Venditore' },
  { value: 'operatore_callcenter', label: 'Operatore Call Center' },
  { value: 'marketing', label: 'Marketing' },
];

const PROVIDER_LABELS: Record<string, string> = {
  email: 'Email',
  google: 'Google',
  apple: 'Apple',
};

export default function AdminPendingUsers() {
  const qc = useQueryClient();
  const [approveUser, setApproveUser] = useState<PendingUser | null>(null);
  const [rejectUser, setRejectUser] = useState<PendingUser | null>(null);
  const [brandId, setBrandId] = useState<string>('');
  const [role, setRole] = useState<AppRole>('venditore');
  const [canAccessChildren, setCanAccessChildren] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data: pending, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['pending-users'],
    queryFn: async (): Promise<PendingUser[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('list_pending_users');
      if (error) throw error;
      return (data ?? []) as PendingUser[];
    },
  });

  const { data: brands } = useQuery({
    queryKey: ['brands-all'],
    queryFn: async (): Promise<Brand[]> => {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Brand[];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!approveUser || !brandId) throw new Error('Brand richiesto');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('approve_pending_user', {
        p_user_id: approveUser.id,
        p_brand_id: brandId,
        p_role: role,
        p_can_access_children: canAccessChildren,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Utente approvato');
      setApproveUser(null);
      setBrandId('');
      setRole('venditore');
      setCanAccessChildren(false);
      qc.invalidateQueries({ queryKey: ['pending-users'] });
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!rejectUser) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('reject_pending_user', {
        p_user_id: rejectUser.id,
        p_reason: rejectReason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Utente rifiutato');
      setRejectUser(null);
      setRejectReason('');
      qc.invalidateQueries({ queryKey: ['pending-users'] });
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Approvazioni utenti</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Assegna brand e ruolo agli utenti in attesa di attivazione.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Aggiorna
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            In attesa
            {pending && <Badge variant="secondary">{pending.length}</Badge>}
          </CardTitle>
          <CardDescription>
            Utenti che hanno effettuato il primo accesso ma non hanno ancora un ruolo assegnato.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !pending || pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nessun utente in attesa.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pending.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{u.full_name || u.email}</span>
                      <Badge variant="outline" className="text-xs">
                        {PROVIDER_LABELS[u.provider] || u.provider}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span className="truncate">{u.email}</span>
                      <span>
                        Registrato{' '}
                        {format(new Date(u.created_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRejectUser(u)}
                    >
                      <UserX className="mr-1.5 h-4 w-4" />
                      Rifiuta
                    </Button>
                    <Button size="sm" onClick={() => setApproveUser(u)}>
                      <UserCheck className="mr-1.5 h-4 w-4" />
                      Approva
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve dialog */}
      <Dialog open={!!approveUser} onOpenChange={(open) => !open && setApproveUser(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Approva utente</DialogTitle>
            <DialogDescription>
              {approveUser?.full_name || approveUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger id="brand">
                  <SelectValue placeholder="Seleziona brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Ruolo</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="children"
                checked={canAccessChildren}
                onCheckedChange={(v) => setCanAccessChildren(!!v)}
              />
              <Label htmlFor="children" className="text-sm font-normal">
                Accesso ai brand figli
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveUser(null)}>
              Annulla
            </Button>
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={!brandId || approveMutation.isPending}
            >
              {approveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectUser} onOpenChange={(open) => !open && setRejectUser(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Rifiuta utente</DialogTitle>
            <DialogDescription>
              L'account verrà sospeso. {rejectUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reason">Motivo (opzionale)</Label>
            <Textarea
              id="reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Es. account duplicato, dominio email non valido..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectUser(null)}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rifiuta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
