import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical, Globe, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import {
  useAllFieldDefinitions,
  useCreateFieldDefinition,
  useUpdateFieldDefinition,
  useDeleteFieldDefinition,
  type FieldDefinition,
  type CustomFieldType,
  type CustomFieldScope,
  type SelectOption,
} from "@/hooks/useCustomFields";

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Testo' },
  { value: 'textarea', label: 'Testo lungo' },
  { value: 'number', label: 'Numero' },
  { value: 'date', label: 'Data' },
  { value: 'bool', label: 'Checkbox' },
  { value: 'select', label: 'Selezione singola' },
  { value: 'multiselect', label: 'Selezione multipla' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Telefono' },
  { value: 'url', label: 'URL' },
];

export function CustomFieldsSettings() {
  const { isAdmin } = useAuth();
  const { currentBrand } = useBrand();
  const { data: fields = [], isLoading } = useAllFieldDefinitions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);

  const globalFields = fields.filter(f => f.scope === 'global');
  const brandFields = fields.filter(f => f.scope === 'brand');

  const handleEdit = (field: FieldDefinition) => {
    setEditingField(field);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingField(null);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingField(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Campi Globali
            </CardTitle>
            <CardDescription>
              Campi disponibili per tutti i brand
            </CardDescription>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Nuovo campo
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {globalFields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun campo globale definito
            </p>
          ) : (
            <FieldList fields={globalFields} onEdit={handleEdit} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Campi Brand: {currentBrand?.name}
          </CardTitle>
          <CardDescription>
            Campi specifici per questo brand
          </CardDescription>
        </CardHeader>
        <CardContent>
          {brandFields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun campo specifico per questo brand
            </p>
          ) : (
            <FieldList fields={brandFields} onEdit={handleEdit} />
          )}
        </CardContent>
      </Card>

      <FieldFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        field={editingField}
        onClose={handleClose}
      />
    </div>
  );
}

function FieldList({
  fields,
  onEdit,
}: {
  fields: FieldDefinition[];
  onEdit: (field: FieldDefinition) => void;
}) {
  const deleteMutation = useDeleteFieldDefinition();

  return (
    <div className="divide-y">
      {fields.map((field) => (
        <div
          key={field.id}
          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{field.label}</span>
              <Badge variant="outline" className="text-[10px]">
                {FIELD_TYPE_OPTIONS.find(t => t.value === field.field_type)?.label}
              </Badge>
              {field.is_required && (
                <Badge variant="destructive" className="text-[10px]">Richiesto</Badge>
              )}
              {!field.is_active && (
                <Badge variant="secondary" className="text-[10px]">Disattivato</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {field.key} {field.description && `• ${field.description}`}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(field)}>
              <Pencil className="h-4 w-4" />
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disattivare questo campo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Il campo "{field.label}" verrà disattivato. I valori esistenti rimarranno nel database ma il campo non sarà più visibile.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate(field.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Disattiva
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldFormDialog({
  open,
  onOpenChange,
  field,
  onClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: FieldDefinition | null;
  onClose: () => void;
}) {
  const { isAdmin } = useAuth();
  const createMutation = useCreateFieldDefinition();
  const updateMutation = useUpdateFieldDefinition();

  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [scope, setScope] = useState<CustomFieldScope>("brand");
  const [isRequired, setIsRequired] = useState(false);
  const [isIndexed, setIsIndexed] = useState(false);
  const [optionsText, setOptionsText] = useState("");

  // Reset form when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && field) {
      setKey(field.key);
      setLabel(field.label);
      setDescription(field.description || "");
      setFieldType(field.field_type);
      setScope(field.scope);
      setIsRequired(field.is_required);
      setIsIndexed(field.is_indexed);
      setOptionsText(field.options?.map(o => `${o.value}:${o.label}`).join("\n") || "");
    } else if (newOpen) {
      setKey("");
      setLabel("");
      setDescription("");
      setFieldType("text");
      setScope("brand");
      setIsRequired(false);
      setIsIndexed(false);
      setOptionsText("");
    }
    onOpenChange(newOpen);
  };

  const parseOptions = (): SelectOption[] => {
    if (!optionsText.trim()) return [];
    return optionsText.split("\n").filter(Boolean).map((line) => {
      const [value, ...labelParts] = line.split(":");
      const label = labelParts.join(":") || value;
      return { value: value.trim(), label: label.trim() };
    });
  };

  const handleSubmit = async () => {
    const options = parseOptions();

    if (field) {
      await updateMutation.mutateAsync({
        id: field.id,
        updates: {
          label,
          description,
          options,
          is_required: isRequired,
          is_indexed: isIndexed,
        },
      });
    } else {
      await createMutation.mutateAsync({
        key: key.toLowerCase().replace(/\s+/g, "_"),
        label,
        description,
        field_type: fieldType,
        scope,
        options,
        is_required: isRequired,
        is_indexed: isIndexed,
      });
    }
    
    onClose();
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const showOptions = ['select', 'multiselect'].includes(fieldType);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{field ? "Modifica campo" : "Nuovo campo personalizzato"}</DialogTitle>
          <DialogDescription>
            {field 
              ? "Modifica le proprietà del campo. La chiave non può essere cambiata."
              : "Crea un nuovo campo per i contatti."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!field && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Chiave (ID tecnico)</Label>
                  <Input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="codice_fiscale"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ambito</Label>
                  <Select value={scope} onValueChange={(v) => setScope(v as CustomFieldScope)} disabled={!isAdmin}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="brand">Solo questo brand</SelectItem>
                      {isAdmin && <SelectItem value="global">Globale (tutti i brand)</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tipo campo</Label>
                <Select value={fieldType} onValueChange={(v) => setFieldType(v as CustomFieldType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Etichetta (mostrata agli utenti)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Codice Fiscale"
            />
          </div>

          <div className="space-y-2">
            <Label>Descrizione (opzionale)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Inserire il codice fiscale del paziente"
            />
          </div>

          {showOptions && (
            <div className="space-y-2">
              <Label>Opzioni (una per riga, formato: valore:etichetta)</Label>
              <Textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="si:Sì&#10;no:No&#10;forse:Forse"
                rows={4}
              />
            </div>
          )}

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={isRequired} onCheckedChange={setIsRequired} />
              <Label>Campo obbligatorio</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isIndexed} onCheckedChange={setIsIndexed} />
              <Label>Indicizzato per ricerca</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={isLoading || !label.trim() || (!field && !key.trim())}>
            {isLoading ? "Salvataggio..." : field ? "Salva modifiche" : "Crea campo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
