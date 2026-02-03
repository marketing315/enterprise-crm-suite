import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Users, Search } from "lucide-react";
import { useTeamMembers, TeamMember } from "@/hooks/useTeam";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface CreateGroupChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateGroup: (title: string, memberIds: string[]) => Promise<void>;
  isPending?: boolean;
}

export function CreateGroupChatDialog({
  open,
  onOpenChange,
  onCreateGroup,
  isPending = false,
}: CreateGroupChatDialogProps) {
  const { user } = useAuth();
  const { data: teamMembers = [], isLoading } = useTeamMembers(undefined, true);
  const [title, setTitle] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter out current user and apply search
  const filteredMembers = teamMembers.filter((member) => {
    if (member.user_id === user?.id) return false;
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      member.full_name?.toLowerCase().includes(searchLower) ||
      member.email.toLowerCase().includes(searchLower)
    );
  });

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (!title.trim() || selectedMembers.length === 0) return;
    await onCreateGroup(title.trim(), selectedMembers);
    // Reset form
    setTitle("");
    setSelectedMembers([]);
    setSearchQuery("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setTitle("");
      setSelectedMembers([]);
      setSearchQuery("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Nuovo gruppo
          </DialogTitle>
          <DialogDescription>
            Crea un gruppo per comunicare con più membri del team
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Group Name */}
          <div className="space-y-2">
            <Label htmlFor="group-name">Nome del gruppo</Label>
            <Input
              id="group-name"
              placeholder="es. Team Vendite Milano"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Member Selection */}
          <div className="space-y-2">
            <Label>Seleziona membri ({selectedMembers.length} selezionati)</Label>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca membri..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                disabled={isPending}
              />
            </div>

            {/* Member List */}
            <ScrollArea className="h-[200px] border rounded-md">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Nessun membro trovato
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredMembers.map((member) => (
                    <MemberRow
                      key={member.user_id}
                      member={member}
                      isSelected={selectedMembers.includes(member.user_id)}
                      onToggle={() => toggleMember(member.user_id)}
                      disabled={isPending}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Annulla
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || selectedMembers.length === 0 || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creazione...
              </>
            ) : (
              "Crea gruppo"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  member,
  isSelected,
  onToggle,
  disabled,
}: {
  member: TeamMember;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
        isSelected && "bg-muted",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-xs">
          {member.full_name?.charAt(0).toUpperCase() || member.email.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {member.full_name || member.email}
        </p>
        {member.full_name && (
          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
        )}
      </div>
    </label>
  );
}
