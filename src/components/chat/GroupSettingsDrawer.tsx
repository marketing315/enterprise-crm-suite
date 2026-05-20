import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Pencil,
  Check,
  X,
  UserPlus,
  MoreVertical,
  Crown,
  Shield,
  User,
  LogOut,
  Loader2,
  Search,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamMembers, TeamMember } from "@/hooks/useTeam";
import {
  useThreadMembers,
  useRenameGroupThread,
  useAddGroupMember,
  useRemoveGroupMember,
  ChatThreadMember,
} from "@/hooks/useChat";
import { cn } from "@/lib/utils";

interface GroupSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  threadTitle: string;
}

export function GroupSettingsDrawer({
  open,
  onOpenChange,
  threadId,
  threadTitle,
}: GroupSettingsDrawerProps) {
  const { user } = useAuth();
  const { data: members = [], isLoading: membersLoading } = useThreadMembers(threadId);
  const rename = useRenameGroupThread();
  const addMember = useAddGroupMember();
  const removeMember = useRemoveGroupMember();

  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState(threadTitle);
  const [showAddMember, setShowAddMember] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ChatThreadMember | null>(null);

  const currentMember = members.find((m) => m.user_id === user?.id);
  const isOwnerOrMod = currentMember?.role === "owner" || currentMember?.role === "moderator";
  const isOwner = currentMember?.role === "owner";

  const handleRename = async () => {
    if (!newTitle.trim() || newTitle === threadTitle) {
      setIsEditing(false);
      return;
    }
    await rename.mutateAsync({ threadId, newTitle: newTitle.trim() });
    setIsEditing(false);
  };

  const handleRemoveMember = async () => {
    if (!confirmRemove) return;
    await removeMember.mutateAsync({ threadId, targetUserId: confirmRemove.user_id });
    setConfirmRemove(null);
  };

  const handleLeave = async () => {
    if (!user?.id) return;
    await removeMember.mutateAsync({ threadId, targetUserId: user.id });
    onOpenChange(false);
  };

  const roleIcon = (role: string) => {
    switch (role) {
      case "owner": return <Crown className="h-3.5 w-3.5 text-amber-500" />;
      case "moderator": return <Shield className="h-3.5 w-3.5 text-blue-500" />;
      default: return <User className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case "owner": return "Owner";
      case "moderator": return "Moderatore";
      default: return "Membro";
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Impostazioni gruppo</SheetTitle>
            <SheetDescription>Gestisci nome e membri del gruppo</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Group Name */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Nome gruppo
              </Label>
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleRename()}
                  />
                  <Button size="icon" variant="ghost" onClick={handleRename} disabled={rename.isPending} aria-label="Caricamento">
                    {rename.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setIsEditing(false); setNewTitle(threadTitle); }} aria-label="Chiudi">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{threadTitle}</span>
                  {isOwnerOrMod && (
                    <Button size="icon" variant="ghost" onClick={() => { setNewTitle(threadTitle); setIsEditing(true); }} aria-label="Modifica">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Members */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Membri ({members.length})
                </Label>
                {isOwnerOrMod && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAddMember(true)}>
                    <UserPlus className="h-3.5 w-3.5" />
                    Aggiungi
                  </Button>
                )}
              </div>

              <ScrollArea className="max-h-[400px]">
                {membersLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {member.user?.full_name?.charAt(0)?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {member.user?.full_name || "Utente"}
                            {member.user_id === user?.id && (
                              <span className="text-muted-foreground ml-1">(tu)</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {roleIcon(member.role)}
                          <Badge variant="outline" className="text-[10px]">
                            {roleLabel(member.role)}
                          </Badge>
                        </div>
                        {/* Actions dropdown - only for owners/mods, not on self */}
                        {isOwnerOrMod && member.user_id !== user?.id && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Altre azioni">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isOwner && member.role === "member" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    addMember.mutate({ threadId, newUserId: member.user_id, role: "moderator" })
                                  }
                                >
                                  <Shield className="h-4 w-4 mr-2" />
                                  Promuovi a moderatore
                                </DropdownMenuItem>
                              )}
                              {isOwner && member.role === "moderator" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    addMember.mutate({ threadId, newUserId: member.user_id, role: "member" })
                                  }
                                >
                                  <User className="h-4 w-4 mr-2" />
                                  Rimuovi moderatore
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setConfirmRemove(member)}
                              >
                                <X className="h-4 w-4 mr-2" />
                                Rimuovi dal gruppo
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            <Separator />

            {/* Leave group */}
            {currentMember && currentMember.role !== "owner" && (
              <Button
                variant="outline"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 gap-2"
                onClick={handleLeave}
                disabled={removeMember.isPending}
              >
                <LogOut className="h-4 w-4" />
                Lascia il gruppo
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Member Dialog */}
      <AddMemberSheet
        open={showAddMember}
        onOpenChange={setShowAddMember}
        threadId={threadId}
        existingMemberIds={members.map((m) => m.user_id)}
        onAdd={(userId) => addMember.mutateAsync({ threadId, newUserId: userId })}
        isPending={addMember.isPending}
      />

      {/* Confirm Remove Dialog */}
      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovi membro</AlertDialogTitle>
            <AlertDialogDescription>
              Vuoi rimuovere {confirmRemove?.user?.full_name || "questo utente"} dal gruppo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AddMemberSheet({
  open,
  onOpenChange,
  threadId,
  existingMemberIds,
  onAdd,
  isPending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  threadId: string;
  existingMemberIds: string[];
  onAdd: (userId: string) => Promise<void>;
  isPending: boolean;
}) {
  const { data: teamMembers = [], isLoading } = useTeamMembers(undefined, true);
  const [search, setSearch] = useState("");

  const available = teamMembers.filter((m) => {
    if (existingMemberIds.includes(m.user_id)) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return m.full_name?.toLowerCase().includes(s) || m.email.toLowerCase().includes(s);
  });

  const handleAdd = async (userId: string) => {
    await onAdd(userId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Aggiungi membro</SheetTitle>
          <SheetDescription>Seleziona un membro del team da aggiungere</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <ScrollArea className="max-h-[400px]">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : available.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nessun membro disponibile</p>
            ) : (
              <div className="space-y-1">
                {available.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {m.full_name?.charAt(0)?.toUpperCase() || m.email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.full_name || m.email}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdd(m.user_id)}
                      disabled={isPending}
                    >
                      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
