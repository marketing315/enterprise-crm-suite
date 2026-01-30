import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Check, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useContactCustomFields, useUpsertFieldValues, type FieldWithValue, type CustomFieldType } from "@/hooks/useCustomFields";
import { Skeleton } from "@/components/ui/skeleton";

interface CustomFieldsSectionProps {
  contactId: string;
}

export function CustomFieldsSection({ contactId }: CustomFieldsSectionProps) {
  const { filledFields, missingFields, isLoading } = useContactCustomFields(contactId);
  const [missingOpen, setMissingOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (filledFields.length === 0 && missingFields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Filled fields */}
      {filledFields.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Campi personalizzati</h3>
          <div className="space-y-2">
            {filledFields.map((field) => (
              <FieldRow key={field.id} field={field} contactId={contactId} />
            ))}
          </div>
        </div>
      )}

      {/* Missing fields - collapsible */}
      {missingFields.length > 0 && (
        <Collapsible open={missingOpen} onOpenChange={setMissingOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Campi mancanti ({missingFields.length})
              </span>
              {missingOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-2">
            {missingFields.map((field) => (
              <MissingFieldRow key={field.id} field={field} contactId={contactId} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// Display a filled field with inline edit capability
function FieldRow({ field, contactId }: { field: FieldWithValue; contactId: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string | boolean>("");
  const upsertMutation = useUpsertFieldValues();

  const startEdit = () => {
    const current = field.displayValue;
    if (typeof current === 'boolean') {
      setEditValue(current);
    } else {
      setEditValue(current?.toString() || "");
    }
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const saveEdit = async () => {
    await upsertMutation.mutateAsync({
      contactId,
      values: [{ field_definition_id: field.id, value: editValue }],
    });
    setIsEditing(false);
  };

  const formatDisplayValue = () => {
    if (field.displayValue === null || field.displayValue === '') return '-';
    
    if (field.field_type === 'bool') {
      return field.displayValue ? 'Sì' : 'No';
    }
    if (field.field_type === 'select' && field.options?.length > 0) {
      const opt = field.options.find(o => o.value === field.displayValue);
      return opt?.label || field.displayValue;
    }
    if (field.field_type === 'date' && field.displayValue) {
      return new Date(field.displayValue as string).toLocaleDateString('it-IT');
    }
    return String(field.displayValue);
  };

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 group">
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">{field.label}</span>
        {isEditing ? (
          <div className="flex items-center gap-2 mt-1">
            <FieldInput
              field={field}
              value={editValue}
              onChange={setEditValue}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit} disabled={upsertMutation.isPending}>
              <Check className="h-3.5 w-3.5 text-primary" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
              <X className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm truncate">{formatDisplayValue()}</p>
            {field.scope === 'global' && <Badge variant="outline" className="text-[10px]">Globale</Badge>}
          </div>
        )}
      </div>
      {!isEditing && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={startEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// A missing field - click to add
function MissingFieldRow({ field, contactId }: { field: FieldWithValue; contactId: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState<string | boolean>("");
  const upsertMutation = useUpsertFieldValues();

  const startAdd = () => {
    setValue(field.field_type === 'bool' ? false : "");
    setIsEditing(true);
  };

  const cancel = () => {
    setIsEditing(false);
  };

  const save = async () => {
    if (value === "" && field.field_type !== 'bool') return;
    
    await upsertMutation.mutateAsync({
      contactId,
      values: [{ field_definition_id: field.id, value }],
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="py-1.5 px-2 rounded-md bg-muted/30 space-y-2">
        <span className="text-xs text-muted-foreground">{field.label}</span>
        <div className="flex items-center gap-2">
          <FieldInput field={field} value={value} onChange={setValue} />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} disabled={upsertMutation.isPending}>
            <Check className="h-3.5 w-3.5 text-primary" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancel}>
            <X className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={startAdd}
      className={cn(
        "w-full flex items-center justify-between py-2 px-3 rounded-md",
        "text-left text-sm text-muted-foreground",
        "hover:bg-muted/50 hover:text-foreground transition-colors",
        "border border-dashed border-muted-foreground/30"
      )}
    >
      <span className="flex items-center gap-2">
        <span>+ {field.label}</span>
        {field.is_required && <Badge variant="destructive" className="text-[10px]">Richiesto</Badge>}
      </span>
      <FieldTypeIcon type={field.field_type} />
    </button>
  );
}

// Field input based on type
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldWithValue;
  value: string | boolean;
  onChange: (val: string | boolean) => void;
}) {
  switch (field.field_type) {
    case 'bool':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={value as boolean}
            onCheckedChange={(checked) => onChange(!!checked)}
          />
          <span className="text-sm">{value ? 'Sì' : 'No'}</span>
        </div>
      );

    case 'select':
      return (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Seleziona..." />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'textarea':
      return (
        <Textarea
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[60px]"
          placeholder={field.description || field.label}
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="h-8"
          placeholder={field.description || field.label}
        />
      );

    case 'date':
      return (
        <Input
          type="date"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="h-8"
        />
      );

    case 'email':
      return (
        <Input
          type="email"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="h-8"
          placeholder="email@example.com"
        />
      );

    case 'url':
      return (
        <Input
          type="url"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="h-8"
          placeholder="https://..."
        />
      );

    case 'phone':
      return (
        <Input
          type="tel"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="h-8"
          placeholder="+39..."
        />
      );

    default:
      return (
        <Input
          type="text"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="h-8"
          placeholder={field.description || field.label}
        />
      );
  }
}

// Icon based on field type
function FieldTypeIcon({ type }: { type: CustomFieldType }) {
  const iconClass = "h-3.5 w-3.5 text-muted-foreground";
  
  switch (type) {
    case 'number':
      return <span className={iconClass}>#</span>;
    case 'date':
      return <span className={iconClass}>📅</span>;
    case 'bool':
      return <span className={iconClass}>☑</span>;
    case 'select':
    case 'multiselect':
      return <span className={iconClass}>▼</span>;
    case 'email':
      return <span className={iconClass}>@</span>;
    case 'phone':
      return <span className={iconClass}>📞</span>;
    case 'url':
      return <span className={iconClass}>🔗</span>;
    case 'textarea':
      return <span className={iconClass}>¶</span>;
    default:
      return <span className={iconClass}>T</span>;
  }
}
