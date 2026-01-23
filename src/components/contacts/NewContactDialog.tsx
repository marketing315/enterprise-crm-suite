import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Phone, User, Mail, MapPin, FileText, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/BrandContext";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone, isValidPhoneNumber } from "@/lib/phoneUtils";
import { useQueryClient } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

const formSchema = z.object({
  phone: z.string().min(1, "Telefono obbligatorio").refine(
    (val) => isValidPhoneNumber(val),
    "Numero di telefono non valido (6-15 cifre)"
  ),
  firstName: z.string().max(100, "Max 100 caratteri").optional(),
  lastName: z.string().max(100, "Max 100 caratteri").optional(),
  email: z.string().email("Email non valida").max(255).optional().or(z.literal("")),
  city: z.string().max(100).optional(),
  cap: z.string().max(10).optional(),
  notes: z.string().max(1000, "Max 1000 caratteri").optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface DuplicateInfo {
  contact_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface NewContactDialogProps {
  onContactCreated?: (contactId: string) => void;
  onDuplicateFound?: (contactId: string) => void;
}

export function NewContactDialog({ onContactCreated, onDuplicateFound }: NewContactDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateInfo | null>(null);
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phone: "",
      firstName: "",
      lastName: "",
      email: "",
      city: "",
      cap: "",
      notes: "",
    },
  });

  const checkDuplicate = useCallback(async (phone: string) => {
    if (!currentBrand || !isValidPhoneNumber(phone)) {
      setDuplicateCheck(null);
      return;
    }

    const normalized = normalizePhone(phone);
    
    const { data, error } = await supabase.rpc("check_phone_duplicate", {
      p_brand_id: currentBrand.id,
      p_phone_normalized: normalized.normalized,
    });

    if (!error && data && data.length > 0) {
      setDuplicateCheck(data[0] as DuplicateInfo);
    } else {
      setDuplicateCheck(null);
    }
  }, [currentBrand]);

  const handlePhoneBlur = () => {
    const phone = form.getValues("phone");
    if (phone) {
      checkDuplicate(phone);
    }
  };

  const openDuplicateContact = () => {
    if (duplicateCheck) {
      setOpen(false);
      onDuplicateFound?.(duplicateCheck.contact_id);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!currentBrand) {
      toast.error("Nessun brand selezionato");
      return;
    }

    // Double-check for duplicate
    if (duplicateCheck) {
      toast.error("Questo numero esiste già. Apri il contatto esistente.");
      return;
    }

    setIsSubmitting(true);

    try {
      const normalized = normalizePhone(values.phone);

      // Use the existing find_or_create_contact RPC
      const { data: contactId, error: contactError } = await supabase.rpc(
        "find_or_create_contact",
        {
          p_brand_id: currentBrand.id,
          p_phone_normalized: normalized.normalized,
          p_phone_raw: normalized.raw,
          p_country_code: normalized.countryCode,
          p_assumed_country: normalized.assumedCountry,
          p_first_name: values.firstName?.trim() || null,
          p_last_name: values.lastName?.trim() || null,
          p_email: values.email?.trim() || null,
          p_city: values.city?.trim() || null,
          p_cap: values.cap?.trim() || null,
        }
      );

      if (contactError) throw contactError;

      // Create manual lead event for audit trail
      const { error: eventError } = await supabase.from("lead_events").insert({
        brand_id: currentBrand.id,
        contact_id: contactId,
        source: "manual",
        source_name: "Creazione manuale",
        raw_payload: {
          created_by: "user",
          notes: values.notes || null,
          phone: values.phone,
        },
      });

      if (eventError) {
        console.error("Failed to create lead event:", eventError);
        // Non-blocking - contact was created successfully
      }

      // Find or create deal for this contact
      const { error: dealError } = await supabase.rpc("find_or_create_deal", {
        p_brand_id: currentBrand.id,
        p_contact_id: contactId,
      });

      if (dealError) {
        console.error("Failed to create deal:", dealError);
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["lead-events"] });

      toast.success("Contatto creato con successo");
      form.reset();
      setOpen(false);
      onContactCreated?.(contactId);
    } catch (error) {
      console.error("Error creating contact:", error);
      toast.error("Errore nella creazione del contatto");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDuplicateName = () => {
    if (!duplicateCheck) return "";
    const parts = [duplicateCheck.first_name, duplicateCheck.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Contatto esistente";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo contatto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nuovo contatto</DialogTitle>
          <DialogDescription>
            Inserisci i dati del nuovo contatto. Il telefono è obbligatorio.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Duplicate Warning */}
            {duplicateCheck && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>Questo numero appartiene a "{getDuplicateName()}"</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openDuplicateContact}
                  >
                    Apri contatto
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Phone (Required) */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefono principale *
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Es. +39 333 1234567"
                      {...field}
                      onBlur={() => {
                        field.onBlur();
                        handlePhoneBlur();
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Nome
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Mario" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cognome</FormLabel>
                    <FormControl>
                      <Input placeholder="Rossi" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="mario@esempio.it" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Location row */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Città
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Milano" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cap"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CAP</FormLabel>
                    <FormControl>
                      <Input placeholder="20100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Note
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Note sul contatto..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={isSubmitting || !!duplicateCheck}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Crea contatto
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
