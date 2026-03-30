import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { User, Calendar, MapPin, Building, FileText, Globe, Tag } from "lucide-react";

interface FieldDefinition {
  path: string;
  label: string;
  example?: string;
}

interface FieldCategory {
  name: string;
  icon: React.ReactNode;
  fields: FieldDefinition[];
}

const FIELD_CATEGORIES: FieldCategory[] = [
  {
    name: "Contatto - Anagrafica",
    icon: <User className="h-4 w-4" />,
    fields: [
      { path: "contact_snapshot.id", label: "ID Contatto", example: "uuid" },
      { path: "contact_snapshot.first_name", label: "Nome", example: "Mario" },
      { path: "contact_snapshot.last_name", label: "Cognome", example: "Rossi" },
      { path: "contact_snapshot.email", label: "Email", example: "mario@example.com" },
      { path: "contact_snapshot.phone", label: "Telefono", example: "+39..." },
    ],
  },
  {
    name: "Contatto - Indirizzo",
    icon: <MapPin className="h-4 w-4" />,
    fields: [
      { path: "contact_snapshot.address", label: "Indirizzo", example: "Via Roma 1" },
      { path: "contact_snapshot.city", label: "Città", example: "Milano" },
      { path: "contact_snapshot.cap", label: "CAP", example: "20100" },
      { path: "contact_snapshot.province", label: "Provincia", example: "MI" },
    ],
  },
  {
    name: "Contatto - Azienda",
    icon: <Building className="h-4 w-4" />,
    fields: [
      { path: "contact_snapshot.company_name", label: "Ragione Sociale" },
      { path: "contact_snapshot.company_address", label: "Indirizzo Azienda" },
      { path: "contact_snapshot.company_zip", label: "CAP Azienda" },
      { path: "contact_snapshot.company_city", label: "Città Azienda" },
      { path: "contact_snapshot.company_province", label: "Provincia Azienda" },
      { path: "contact_snapshot.vat_number", label: "Partita IVA" },
      { path: "contact_snapshot.fiscal_code", label: "Codice Fiscale" },
    ],
  },
  {
    name: "Lead Info",
    icon: <Tag className="h-4 w-4" />,
    fields: [
      { path: "contact_snapshot.lead_type", label: "Tipo Lead" },
      { path: "contact_snapshot.lead_message", label: "Messaggio Lead" },
      { path: "contact_snapshot.lead_cost", label: "Costo Lead" },
      { path: "contact_snapshot.lead_valid", label: "Lead Valido (bool)" },
      { path: "contact_snapshot.lead_state_id", label: "ID Stato Lead" },
      { path: "contact_snapshot.quiz_answers", label: "Risposte Quiz (JSON)" },
    ],
  },
  {
    name: "Note Personalizzate",
    icon: <FileText className="h-4 w-4" />,
    fields: [
      { path: "contact_snapshot.note1", label: "Nota 1" },
      { path: "contact_snapshot.note2", label: "Nota 2" },
      { path: "contact_snapshot.note3", label: "Nota 3" },
      { path: "contact_snapshot.note4", label: "Nota 4" },
      { path: "contact_snapshot.note5", label: "Nota 5" },
      { path: "contact_snapshot.note6", label: "Nota 6" },
      { path: "contact_snapshot.note7", label: "Nota 7" },
      { path: "contact_snapshot.note8", label: "Nota 8" },
      { path: "contact_snapshot.note9", label: "Nota 9" },
      { path: "contact_snapshot.note10", label: "Nota 10" },
    ],
  },
  {
    name: "Evento",
    icon: <Calendar className="h-4 w-4" />,
    fields: [
      { path: "event_type", label: "Tipo Evento", example: "lead_event.created" },
      { path: "event_id", label: "ID Evento" },
      { path: "source", label: "Sorgente", example: "webhook" },
      { path: "source_name", label: "Nome Sorgente", example: "Landing Page" },
      { path: "created_at", label: "Data Creazione", example: "ISO 8601" },
    ],
  },
  {
    name: "Tracking UTM",
    icon: <Globe className="h-4 w-4" />,
    fields: [
      { path: "tracking.utm_source", label: "UTM Source" },
      { path: "tracking.utm_medium", label: "UTM Medium" },
      { path: "tracking.utm_campaign", label: "UTM Campaign" },
      { path: "tracking.utm_content", label: "UTM Content" },
      { path: "tracking.utm_term", label: "UTM Term" },
      { path: "tracking.gclid", label: "Google Click ID" },
      { path: "tracking.fbp", label: "Facebook Pixel ID" },
      { path: "tracking.fbc", label: "Facebook Click ID" },
    ],
  },
];

interface Props {
  value: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
}

export function FieldMappingEditor({ value, onChange }: Props) {
  // Reverse mapping: sourcePath -> destinationField
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Initialize from value prop (which is destination -> source)
  useEffect(() => {
    const reversed: Record<string, string> = {};
    for (const [dest, src] of Object.entries(value)) {
      reversed[src] = dest;
    }
    setFieldValues(reversed);
  }, [value]);

  const handleFieldChange = (sourcePath: string, destinationField: string) => {
    const newFieldValues = { ...fieldValues };
    
    if (destinationField.trim() === "") {
      delete newFieldValues[sourcePath];
    } else {
      newFieldValues[sourcePath] = destinationField.trim();
    }
    
    setFieldValues(newFieldValues);

    // Convert back to destination -> source format
    const newMapping: Record<string, string> = {};
    for (const [src, dest] of Object.entries(newFieldValues)) {
      if (dest) {
        newMapping[dest] = src;
      }
    }
    onChange(newMapping);
  };

  const getMappedCount = (category: FieldCategory): number => {
    return category.fields.filter((f) => fieldValues[f.path]).length;
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Mapping Campi</Label>
      <p className="text-xs text-muted-foreground mb-3">
        Per ogni campo sorgente, inserisci il nome del campo destinazione. Lascia vuoto per escludere.
      </p>
      
      <ScrollArea className="h-[350px] rounded-md border">
        <Accordion type="multiple" className="w-full" defaultValue={["Contatto - Anagrafica", "Lead Info"]}>
          {FIELD_CATEGORIES.map((category) => (
            <AccordionItem key={category.name} value={category.name}>
              <AccordionTrigger className="px-4 py-2 hover:no-underline">
                <div className="flex items-center gap-2">
                  {category.icon}
                  <span className="text-sm font-medium">{category.name}</span>
                  {getMappedCount(category) > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {getMappedCount(category)} mappati
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-3">
                  {category.fields.map((field) => (
                    <div key={field.path} className="grid grid-cols-2 gap-2 items-center">
                      <div className="text-xs">
                        <span className="font-medium">{field.label}</span>
                        <span className="block text-muted-foreground font-mono text-[10px]">
                          {field.path}
                        </span>
                      </div>
                      <Input
                        placeholder="Campo destinazione..."
                        className="h-8 text-xs"
                        value={fieldValues[field.path] || ""}
                        onChange={(e) => handleFieldChange(field.path, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </ScrollArea>

      <p className="text-xs text-muted-foreground">
        Campi mappati: <span className="font-medium">{Object.keys(fieldValues).filter(k => fieldValues[k]).length}</span>
      </p>
    </div>
  );
}
