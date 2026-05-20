import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Clock, MoreHorizontal, Phone, RefreshCw, X, Eye } from "lucide-react";
import {
  useAutomationJobs,
  useCancelJob,
  useRetryJob,
  useUpdateJobRunAt,
  type AutomationJob,
} from "@/hooks/useAutomationJobs";

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  running: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  sent: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  canceled: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

const statusLabels: Record<string, string> = {
  scheduled: "Programmato",
  running: "In esecuzione",
  sent: "Inviato",
  failed: "Fallito",
  canceled: "Annullato",
};

export function AutomationJobsTable() {
  const [activeTab, setActiveTab] = useState("scheduled");
  const [editingJob, setEditingJob] = useState<AutomationJob | null>(null);
  const [newRunAt, setNewRunAt] = useState("");
  const [viewingPayload, setViewingPayload] = useState<AutomationJob | null>(null);

  const { data: jobs, isLoading } = useAutomationJobs(activeTab === "all" ? undefined : activeTab);
  const cancelJob = useCancelJob();
  const retryJob = useRetryJob();
  const updateRunAt = useUpdateJobRunAt();

  const handleEditRunAt = (job: AutomationJob) => {
    setEditingJob(job);
    setNewRunAt(format(new Date(job.run_at), "yyyy-MM-dd'T'HH:mm"));
  };

  const handleSaveRunAt = () => {
    if (editingJob && newRunAt) {
      updateRunAt.mutate({
        jobId: editingJob.id,
        runAt: new Date(newRunAt).toISOString(),
      });
      setEditingJob(null);
    }
  };

  const getContactDisplay = (job: AutomationJob) => {
    if (!job.contact) return "N/A";
    const name = [job.contact.first_name, job.contact.last_name].filter(Boolean).join(" ");
    const phone = job.contact.contact_phones?.find((p) => p.is_primary)?.phone_normalized;
    return (
      <div className="flex flex-col">
        <span className="font-medium">{name || "Senza nome"}</span>
        {phone && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {phone}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scheduled">Programmati</TabsTrigger>
          <TabsTrigger value="sent">Inviati</TabsTrigger>
          <TabsTrigger value="failed">Falliti</TabsTrigger>
          <TabsTrigger value="canceled">Annullati</TabsTrigger>
          <TabsTrigger value="all">Tutti</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
          ) : !jobs?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun job {statusLabels[activeTab]?.toLowerCase() || "trovato"}
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contatto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Esecuzione</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Tentativi</TableHead>
                    <TableHead className="w-[100px]">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>{getContactDisplay(job)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{job.job_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(job.run_at), "dd/MM/yyyy", { locale: it })}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(job.run_at), "HH:mm", { locale: it })}
                            {job.status === "scheduled" && (
                              <span className="ml-1">
                                ({formatDistanceToNow(new Date(job.run_at), { locale: it, addSuffix: true })})
                              </span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[job.status]}>
                          {statusLabels[job.status]}
                        </Badge>
                        {job.last_error && (
                          <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={job.last_error}>
                            {job.last_error}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{job.attempts}/{job.max_attempts}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Altre azioni">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewingPayload(job)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Visualizza Payload
                            </DropdownMenuItem>
                            {job.status === "scheduled" && (
                              <>
                                <DropdownMenuItem onClick={() => handleEditRunAt(job)}>
                                  <Clock className="h-4 w-4 mr-2" />
                                  Modifica orario
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => cancelJob.mutate(job.id)}
                                  className="text-destructive"
                                >
                                  <X className="h-4 w-4 mr-2" />
                                  Annulla
                                </DropdownMenuItem>
                              </>
                            )}
                            {(job.status === "failed" || job.status === "canceled") && (
                              <DropdownMenuItem onClick={() => retryJob.mutate({ jobId: job.id })}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Riprova ora
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Run At Dialog */}
      <Dialog open={!!editingJob} onOpenChange={() => setEditingJob(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica data esecuzione</DialogTitle>
          <DialogDescription className="sr-only">Finestra di dialogo</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="run_at">Nuova data/ora</Label>
              <Input
                id="run_at"
                type="datetime-local"
                value={newRunAt}
                onChange={(e) => setNewRunAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingJob(null)}>
              Annulla
            </Button>
            <Button onClick={handleSaveRunAt} disabled={updateRunAt.isPending}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Payload Dialog */}
      <Dialog open={!!viewingPayload} onOpenChange={() => setViewingPayload(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Payload Job</DialogTitle>
          <DialogDescription className="sr-only">Finestra di dialogo</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
              {JSON.stringify(viewingPayload?.payload, null, 2)}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
