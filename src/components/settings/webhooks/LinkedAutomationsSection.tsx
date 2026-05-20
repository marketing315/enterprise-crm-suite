 import { useState } from "react";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { Switch } from "@/components/ui/switch";
 import { Separator } from "@/components/ui/separator";
 import { 
 Collapsible, 
 CollapsibleContent, 
 CollapsibleTrigger 
 } from "@/components/ui/collapsible";
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
 import { Zap, Plus, ChevronDown, Trash2, ExternalLink } from "lucide-react";
 import { toast } from "sonner";
 import { Link } from "react-router-dom";
 import {
 useAutomationRules,
 useUpdateAutomationRule,
 useDeleteAutomationRule,
 ACTION_TYPES,
 type AutomationRule,
 } from "@/hooks/useAutomationRules";
 import { useAutomationEventTypes } from "@/hooks/useInboundSources";
 import { AutomationRuleFormDrawer } from "@/components/settings/automation/AutomationRuleFormDrawer";
 
 interface LinkedAutomationsSectionProps {
   /**
    * Filter automations by event type pattern (e.g., "inbound.*", "keplero.*")
    * For inbound sources, use the source name prefixed with "inbound."
    */
   eventTypeFilter?: string;
   /**
    * Filter automations by source name (for inbound sources)
    */
   sourceFilter?: string;
   /**
    * Default event type for new automations
    */
   defaultEventType?: string;
   /**
    * Default source for new automations (for inbound sources)
    */
   defaultSource?: string;
   /**
    * Section title
    */
   title?: string;
 }
 
 export function LinkedAutomationsSection({
   eventTypeFilter,
   sourceFilter,
   defaultEventType,
   defaultSource,
   title = "Automazioni Collegate",
 }: LinkedAutomationsSectionProps) {
   const { data: allRules, isLoading } = useAutomationRules();
   const updateRule = useUpdateAutomationRule();
   const deleteRule = useDeleteAutomationRule();
   const { eventTypes: AUTOMATION_EVENT_TYPES } = useAutomationEventTypes();
 
   const [isOpen, setIsOpen] = useState(true);
   const [formOpen, setFormOpen] = useState(false);
   const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
   const [deleteId, setDeleteId] = useState<string | null>(null);
 
   // Filter rules based on criteria
   const linkedRules = allRules?.filter((rule) => {
     // Filter by source if provided - check both trigger_source and event type pattern
     if (sourceFilter) {
       const matchesSource = rule.trigger_source === sourceFilter;
       const matchesEventPattern = rule.trigger_event_type === `inbound.${sourceFilter}`;
       if (!matchesSource && !matchesEventPattern) {
         return false;
       }
     }
     
     // Filter by event type pattern if provided
     if (eventTypeFilter) {
       if (eventTypeFilter.endsWith(".*")) {
         const prefix = eventTypeFilter.replace(".*", ".");
         return rule.trigger_event_type?.startsWith(prefix) || 
                rule.trigger_event_type === eventTypeFilter;
       }
       return rule.trigger_event_type === eventTypeFilter;
     }
     
     return true;
   }) || [];
 
   const handleToggleActive = async (rule: AutomationRule) => {
     try {
       await updateRule.mutateAsync({ 
         id: rule.id, 
         is_active: !rule.is_active 
       });
       toast.success(rule.is_active ? "Automazione disattivata" : "Automazione attivata");
     } catch {
       toast.error("Errore durante l'aggiornamento");
     }
   };
 
   const handleDelete = async () => {
     if (!deleteId) return;
     try {
       await deleteRule.mutateAsync(deleteId);
       toast.success("Automazione eliminata");
       setDeleteId(null);
     } catch {
       toast.error("Errore durante l'eliminazione");
     }
   };
 
   const getEventTypeLabel = (eventType: string | null) => {
     if (!eventType) return "N/D";
     const found = AUTOMATION_EVENT_TYPES.find((e) => e.value === eventType);
     return found?.label || eventType;
   };
 
  const getActionsPreview = (actions: AutomationRule["actions"]) => {
    if (!actions || actions.length === 0) return "Nessuna azione";
    const getLabel = (type: string) => {
      const found = ACTION_TYPES.find((t) => t.value === type);
      return found?.label || type;
    };
    return actions
      .slice(0, 3)
      .map((a) => getLabel(a.type))
      .join(" → ") + (actions.length > 3 ? ` +${actions.length - 3}` : "");
  };
 
   const handleCreateNew = () => {
     setEditingRule(null);
     setFormOpen(true);
   };
 
   const handleEdit = (rule: AutomationRule) => {
     setEditingRule(rule);
     setFormOpen(true);
   };
 
   return (
     <>
       <Separator className="my-4" />
       
       <Collapsible open={isOpen} onOpenChange={setIsOpen}>
         <CollapsibleTrigger asChild>
           <Button
             variant="ghost"
             type="button"
             className="w-full justify-between px-0 hover:bg-transparent"
           >
             <span className="flex items-center gap-2 text-sm font-medium">
               <Zap className="h-4 w-4" />
               {title}
               {linkedRules.length > 0 && (
                 <Badge variant="secondary" className="ml-1">
                   {linkedRules.length}
                 </Badge>
               )}
             </span>
             <ChevronDown 
               className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} 
             />
           </Button>
         </CollapsibleTrigger>
         
         <CollapsibleContent className="space-y-3 pt-3">
           {isLoading ? (
             <p className="text-sm text-muted-foreground">Caricamento...</p>
           ) : linkedRules.length === 0 ? (
             <div className="text-center py-4 text-muted-foreground">
               <Zap className="mx-auto h-8 w-8 opacity-20 mb-2" />
               <p className="text-sm">Nessuna automazione collegata</p>
               <p className="text-xs">Crea un'automazione per processare gli eventi</p>
             </div>
           ) : (
             <div className="space-y-2">
               {linkedRules.map((rule) => (
                 <div
                   key={rule.id}
                   className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card"
                 >
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2">
                       <button
                         type="button"
                         onClick={() => handleEdit(rule)}
                         className="font-medium text-sm truncate hover:underline text-left"
                       >
                         {rule.name}
                       </button>
                       {!rule.is_active && (
                         <Badge variant="outline" className="text-xs">
                           Disattivata
                         </Badge>
                       )}
                     </div>
                     <p className="text-xs text-muted-foreground truncate">
                       {getActionsPreview(rule.actions)}
                     </p>
                   </div>
                   
                   <div className="flex items-center gap-2">
                     <Switch
                       checked={rule.is_active}
                       onCheckedChange={() => handleToggleActive(rule)}
                       disabled={updateRule.isPending}
                     />
                     <Button
                       type="button"
                       variant="ghost"
                       size="icon"
                       className="h-8 w-8 text-destructive hover:text-destructive"
                       onClick={() => setDeleteId(rule.id)}
                      aria-label="Elimina">
                       <Trash2 className="h-4 w-4" />
                     </Button>
                   </div>
                 </div>
               ))}
             </div>
           )}
           
           <div className="flex gap-2">
             <Button
               type="button"
               variant="outline"
               size="sm"
               className="flex-1"
               onClick={handleCreateNew}
             >
               <Plus className="mr-2 h-4 w-4" />
               Nuova Automazione
             </Button>
             <Button
               type="button"
               variant="ghost"
               size="sm"
               asChild
             >
               <Link to="/settings?tab=automation">
                 <ExternalLink className="mr-2 h-4 w-4" />
                 Vedi tutte
               </Link>
             </Button>
           </div>
         </CollapsibleContent>
       </Collapsible>
 
       {/* Form Drawer */}
       <AutomationRuleFormDrawer
         open={formOpen}
         onOpenChange={setFormOpen}
         editingRule={editingRule}
         defaultEventType={defaultEventType}
         defaultSource={defaultSource}
       />
 
       {/* Delete Confirmation */}
       <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Eliminare questa automazione?</AlertDialogTitle>
             <AlertDialogDescription>
               L'automazione verrà rimossa permanentemente. Gli eventi futuri non verranno più processati da questa regola.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Annulla</AlertDialogCancel>
             <AlertDialogAction
               onClick={handleDelete}
               className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
             >
               Elimina
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
     </>
   );
 }