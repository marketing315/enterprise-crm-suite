import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import { Bot, MessageSquare } from "lucide-react";
import {
  useChatThreads,
  useChatMessages,
  useSendChatMessage,
  useSendAIMessage,
  useChatRealtime,
  useCreateGroupChat,
  useUnreadCounts,
  useMarkThreadRead,
  useThreadDisplayTitles,
  useArchiveThread,
  useDeleteThread,
  useArchivedThreads,
  useUnarchiveThread,
} from "@/hooks/useChat";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import { AgentChatPanel } from "@/components/chat/AgentChatPanel";
import { CreateGroupChatDialog } from "@/components/chat/CreateGroupChatDialog";
import { GroupSettingsDrawer } from "@/components/chat/GroupSettingsDrawer";
import { ChatThreadList } from "@/components/chat/ChatThreadList";
import { ChatMessagePanel } from "@/components/chat/ChatMessagePanel";
import { useAIAgentChat, useCreateNewExecutiveThread } from "@/hooks/useAIAgent";

export default function Chat() {
  const { user } = useAuth();
  const { currentBrand } = useBrand();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [askAI, setAskAI] = useState(false);
  const [activeTab, setActiveTab] = useState<"threads" | "agent">("agent");
  const [forceExecutiveThreadId, setForceExecutiveThreadId] = useState<string | null>(null);
  const [draftExecutiveThread, setDraftExecutiveThread] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [deleteConfirmThreadId, setDeleteConfirmThreadId] = useState<string | null>(null);

  // Data hooks
  const { data: threads = [], isLoading: threadsLoading } = useChatThreads();
  const { data: messages = [], isLoading: messagesLoading } = useChatMessages(selectedThreadId || "");
  const sendMessage = useSendChatMessage();
  const sendAIMessage = useSendAIMessage();
  const agentChat = useAIAgentChat();
  const createNewAIThread = useCreateNewExecutiveThread();
  const createGroupChat = useCreateGroupChat();
  const archiveThread = useArchiveThread();
  const deleteThread = useDeleteThread();
  const unarchiveThread = useUnarchiveThread();
  const { data: archivedThreads = [], isLoading: archivedLoading } = useArchivedThreads();
  const { subscribeToMessages } = useChatRealtime(selectedThreadId);
  const { data: unreadCounts = [] } = useUnreadCounts();
  const markRead = useMarkThreadRead();
  const allThreadIds = [...threads.map(t => t.id), ...archivedThreads.map(t => t.id)];
  const { data: titleMap = new Map() } = useThreadDisplayTitles(allThreadIds);

  const selectedThread = threads.find((t) => t.id === selectedThreadId);
  const isExecutiveThread = selectedThread?.type === "executive" || selectedThreadId === forceExecutiveThreadId || draftExecutiveThread;

  // Auto-enable AI for executive threads
  useEffect(() => {
    if (isExecutiveThread) setAskAI(true);
  }, [selectedThreadId, isExecutiveThread]);

  // Mark read on select
  useEffect(() => {
    if (selectedThreadId) markRead.mutate(selectedThreadId);
  }, [selectedThreadId]);

  // Realtime subscription
  useEffect(() => {
    const unsubscribe = subscribeToMessages();
    return () => unsubscribe();
  }, [selectedThreadId, subscribeToMessages]);

  const handleNewAIChat = () => {
    setDraftExecutiveThread(true);
    setSelectedThreadId(null);
    setForceExecutiveThreadId(null);
    setAskAI(true);
  };

  const handleCreateGroup = async (title: string, memberIds: string[]) => {
    const threadId = await createGroupChat.mutateAsync({ title, memberIds });
    setCreateGroupOpen(false);
    setSelectedThreadId(threadId);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !currentBrand) return;

    const text = messageInput.trim();
    setMessageInput("");

    let activeThreadId = selectedThreadId;
    if (draftExecutiveThread && !activeThreadId) {
      try {
        const newId = await createNewAIThread.mutateAsync();
        setForceExecutiveThreadId(newId);
        setSelectedThreadId(newId);
        setDraftExecutiveThread(false);
        activeThreadId = newId;
      } catch {
        toast.error("Errore nella creazione della conversazione");
        return;
      }
    }
    if (!activeThreadId) return;

    if (isExecutiveThread) {
      try {
        await agentChat.mutateAsync({ message: text, threadId: activeThreadId });
      } catch {
        toast.error("Errore nella risposta AI");
      }
    } else if (askAI) {
      await sendMessage.mutateAsync({ threadId: selectedThreadId, messageText: text });
      try {
        const aiBrandId = selectedThread?.brand_id || currentBrand.id;
        await sendAIMessage.mutateAsync({
          threadId: selectedThreadId,
          message: text,
          entityType: selectedThread?.entity_type || undefined,
          entityId: selectedThread?.entity_id || undefined,
          brandId: aiBrandId,
        });
      } catch {
        toast.error("Errore nella risposta AI");
      }
    } else {
      await sendMessage.mutateAsync({ threadId: selectedThreadId, messageText: text });
    }
  };

  const isPending = sendMessage.isPending || sendAIMessage.isPending || agentChat.isPending;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 6rem)" }}>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "threads" | "agent")}
        className="flex-1 flex flex-col min-h-0"
      >
        {/* Tab Bar */}
        <div className="pb-3">
          <TabsList className="grid w-full max-w-sm grid-cols-2 h-10 p-1 bg-muted/50">
            <TabsTrigger value="agent" className="gap-2 text-sm data-[state=active]:shadow-sm">
              <Bot className="h-4 w-4" />
              <span>Agente AI</span>
            </TabsTrigger>
            <TabsTrigger value="threads" className="gap-2 text-sm data-[state=active]:shadow-sm">
              <MessageSquare className="h-4 w-4" />
              <span>Conversazioni</span>
              {unreadCounts.length > 0 && (
                <Badge className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px] bg-primary">
                  {unreadCounts.reduce((sum, u) => sum + u.unread_count, 0)}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Agent Tab */}
        <TabsContent value="agent" className="flex-1 min-h-0 mt-0 overflow-hidden">
          <AgentChatPanel />
        </TabsContent>

        {/* Conversations Tab */}
        <TabsContent value="threads" className="flex-1 min-h-0 mt-0">
          <div className="h-full flex rounded-xl border border-border/50 overflow-hidden bg-background">
            <ChatThreadList
              threads={threads}
              archivedThreads={archivedThreads}
              threadsLoading={threadsLoading}
              archivedLoading={archivedLoading}
              selectedThreadId={selectedThreadId}
              unreadCounts={unreadCounts}
              titleMap={titleMap}
              onSelectThread={(id) => { setSelectedThreadId(id); setDraftExecutiveThread(false); }}
              onArchive={(id) => { if (selectedThreadId === id) setSelectedThreadId(null); archiveThread.mutate(id); }}
              onUnarchive={(id) => unarchiveThread.mutate(id)}
              onDelete={(id) => setDeleteConfirmThreadId(id)}
              onCreateGroup={() => setCreateGroupOpen(true)}
              onNewAIChat={handleNewAIChat}
              isCreatingAI={createNewAIThread.isPending}
            />
            <ChatMessagePanel
              thread={selectedThread || null}
              messages={messages}
              messagesLoading={messagesLoading}
              userId={user?.id || null}
              messageInput={messageInput}
              setMessageInput={setMessageInput}
              askAI={askAI}
              setAskAI={setAskAI}
              isExecutiveThread={isExecutiveThread}
              isPending={isPending}
              isDraftMode={draftExecutiveThread}
              onSend={handleSendMessage}
              onGroupSettings={() => setGroupSettingsOpen(true)}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreateGroupChatDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        onCreateGroup={handleCreateGroup}
        isPending={createGroupChat.isPending}
      />

      {selectedThread?.type === "group" && selectedThreadId && (
        <GroupSettingsDrawer
          open={groupSettingsOpen}
          onOpenChange={setGroupSettingsOpen}
          threadId={selectedThreadId}
          threadTitle={selectedThread.title || "Gruppo"}
        />
      )}

      <AlertDialog open={!!deleteConfirmThreadId} onOpenChange={(open) => !open && setDeleteConfirmThreadId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa conversazione?</AlertDialogTitle>
            <AlertDialogDescription>
              Tutti i messaggi verranno eliminati permanentemente. Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteConfirmThreadId) return;
                if (selectedThreadId === deleteConfirmThreadId) setSelectedThreadId(null);
                deleteThread.mutate(deleteConfirmThreadId);
                setDeleteConfirmThreadId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
