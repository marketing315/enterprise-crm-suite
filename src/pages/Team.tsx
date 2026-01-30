import { useState } from 'react';
import { useBrand } from '@/contexts/BrandContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus, Users } from 'lucide-react';
import { TeamMembersTable } from '@/components/team/TeamMembersTable';
import { InviteUserDialog } from '@/components/team/InviteUserDialog';
import { useAssignableRoles } from '@/hooks/useTeam';
import type { AppRole } from '@/types/database';

export default function Team() {
  const { currentBrand } = useBrand();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<AppRole | undefined>();
  const [showInactive, setShowInactive] = useState(false);

  const { data: assignableRoles = [] } = useAssignableRoles();
  const canInvite = assignableRoles.length > 0;

  if (!currentBrand) {
    return (
      <div className="container py-8 text-center text-muted-foreground">
        Seleziona un brand per visualizzare il team.
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Team
          </h1>
          <p className="text-muted-foreground">
            Gestisci i membri del team per {currentBrand.name}
          </p>
        </div>
        {canInvite && (
          <Button onClick={() => setInviteDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Aggiungi utente
          </Button>
        )}
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <CardTitle>Membri del team</CardTitle>
          <CardDescription>
            Visualizza e gestisci i ruoli degli utenti nel brand corrente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamMembersTable 
            roleFilter={roleFilter}
            showInactive={showInactive}
            onFilterChange={setRoleFilter}
            onShowInactiveChange={setShowInactive}
          />
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <InviteUserDialog 
        open={inviteDialogOpen} 
        onOpenChange={setInviteDialogOpen} 
      />
    </div>
  );
}
