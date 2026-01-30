import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useToast } from "@/hooks/use-toast";

// Types for custom fields
export type CustomFieldType = 'text' | 'number' | 'date' | 'bool' | 'select' | 'multiselect' | 'email' | 'phone' | 'url' | 'textarea';
export type CustomFieldScope = 'global' | 'brand';

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldDefinition {
  id: string;
  scope: CustomFieldScope;
  brand_id: string | null;
  key: string;
  label: string;
  description: string | null;
  field_type: CustomFieldType;
  options: SelectOption[];
  is_required: boolean;
  is_indexed: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface FieldValue {
  id: string;
  contact_id: string;
  brand_id: string;
  field_definition_id: string;
  value_text: string | null;
  value_number: number | null;
  value_bool: boolean | null;
  value_date: string | null;
  value_json: unknown | null;
  updated_at: string;
}

export interface FieldWithValue extends FieldDefinition {
  value?: FieldValue;
  displayValue?: string | number | boolean | null;
}

// Hook to get field definitions for current brand
export function useFieldDefinitions() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["field-definitions", currentBrand?.id],
    queryFn: async (): Promise<FieldDefinition[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase.rpc("get_contact_field_definitions", {
        p_brand_id: currentBrand.id,
      });

      if (error) throw error;
      
      // Map RPC response to FieldDefinition type
      return (data || []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        scope: d.scope as CustomFieldScope,
        brand_id: d.brand_id as string | null,
        key: d.key as string,
        label: d.label as string,
        description: d.description as string | null,
        field_type: d.field_type as CustomFieldType,
        options: (d.options || []) as SelectOption[],
        is_required: d.is_required as boolean,
        is_indexed: false,
        is_active: true,
        display_order: d.display_order as number,
        created_at: "",
        updated_at: "",
      }));
    },
    enabled: !!currentBrand,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Hook to get field values for a specific contact
export function useContactFieldValues(contactId: string | null) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["contact-field-values", contactId],
    queryFn: async (): Promise<FieldValue[]> => {
      if (!contactId || !currentBrand) return [];

      const { data, error } = await supabase
        .from("contact_field_values")
        .select("*")
        .eq("contact_id", contactId)
        .eq("brand_id", currentBrand.id);

      if (error) throw error;
      return (data || []) as FieldValue[];
    },
    enabled: !!contactId && !!currentBrand,
  });
}

// Combined hook: definitions + values for a contact
export function useContactCustomFields(contactId: string | null) {
  const { data: definitions = [], isLoading: defsLoading } = useFieldDefinitions();
  const { data: values = [], isLoading: valsLoading } = useContactFieldValues(contactId);

  const fieldsWithValues: FieldWithValue[] = definitions.map((def) => {
    const value = values.find((v) => v.field_definition_id === def.id);
    let displayValue: string | number | boolean | null = null;

    if (value) {
      switch (def.field_type) {
        case 'text':
        case 'email':
        case 'phone':
        case 'url':
        case 'textarea':
        case 'select':
          displayValue = value.value_text;
          break;
        case 'number':
          displayValue = value.value_number;
          break;
        case 'bool':
          displayValue = value.value_bool;
          break;
        case 'date':
          displayValue = value.value_date;
          break;
        case 'multiselect':
          displayValue = value.value_json ? JSON.stringify(value.value_json) : null;
          break;
      }
    }

    return { ...def, value, displayValue };
  });

  const filledFields = fieldsWithValues.filter((f) => f.displayValue !== null && f.displayValue !== '');
  const missingFields = fieldsWithValues.filter((f) => f.displayValue === null || f.displayValue === '');

  return {
    allFields: fieldsWithValues,
    filledFields,
    missingFields,
    isLoading: defsLoading || valsLoading,
  };
}

// Mutation to upsert field values
export function useUpsertFieldValues() {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      contactId: string;
      values: Array<{ field_definition_id: string; value: unknown }>;
    }) => {
      if (!currentBrand) throw new Error("No brand selected");

      // Convert to JSON-safe format
      const jsonValues = params.values.map(v => ({
        field_definition_id: v.field_definition_id,
        value: v.value === undefined ? null : v.value,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("upsert_contact_field_values", {
        p_contact_id: params.contactId,
        p_brand_id: currentBrand.id,
        p_values: jsonValues,
      } as any);

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contact-field-values", variables.contactId] });
      toast({ title: "Campi aggiornati", description: "I valori sono stati salvati." });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });
}

// Admin: Create field definition
export function useCreateFieldDefinition() {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      key: string;
      label: string;
      field_type: CustomFieldType;
      scope: CustomFieldScope;
      description?: string;
      options?: SelectOption[];
      is_required?: boolean;
      is_indexed?: boolean;
      display_order?: number;
    }) => {
      const insertData = {
        key: params.key,
        label: params.label,
        field_type: params.field_type,
        scope: params.scope,
        description: params.description || null,
        brand_id: params.scope === 'brand' ? currentBrand?.id : null,
        options: (params.options || []) as unknown as Record<string, unknown>,
        is_required: params.is_required ?? false,
        is_indexed: params.is_indexed ?? false,
        display_order: params.display_order ?? 0,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase
        .from("contact_field_definitions")
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["field-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["all-field-definitions"] });
      toast({ title: "Campo creato", description: "Il nuovo campo è disponibile." });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });
}

// Admin: Update field definition
export function useUpdateFieldDefinition() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      updates: Partial<{
        label: string;
        description: string;
        options: SelectOption[];
        is_required: boolean;
        is_indexed: boolean;
        is_active: boolean;
        display_order: number;
      }>;
    }) => {
      // Convert options to JSON-safe format
      const updateData: Record<string, unknown> = { ...params.updates };
      if (params.updates.options) {
        updateData.options = params.updates.options as unknown as Record<string, unknown>;
      }

      const { data, error } = await supabase
        .from("contact_field_definitions")
        .update(updateData)
        .eq("id", params.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["field-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["all-field-definitions"] });
      toast({ title: "Campo aggiornato" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });
}

// Admin: Delete (deactivate) field definition
export function useDeleteFieldDefinition() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (fieldId: string) => {
      const { error } = await supabase
        .from("contact_field_definitions")
        .update({ is_active: false })
        .eq("id", fieldId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["field-definitions"] });
      toast({ title: "Campo disattivato" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });
}

// Get all definitions for admin (including inactive)
export function useAllFieldDefinitions() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["all-field-definitions", currentBrand?.id],
    queryFn: async (): Promise<FieldDefinition[]> => {
      let query = supabase
        .from("contact_field_definitions")
        .select("*")
        .order("display_order")
        .order("label");

      // Get global + brand-specific
      if (currentBrand) {
        query = query.or(`scope.eq.global,brand_id.eq.${currentBrand.id}`);
      } else {
        query = query.eq("scope", "global");
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Map DB response to typed FieldDefinition
      return (data || []).map((d) => ({
        id: d.id,
        scope: d.scope as CustomFieldScope,
        brand_id: d.brand_id,
        key: d.key,
        label: d.label,
        description: d.description,
        field_type: d.field_type as CustomFieldType,
        options: (d.options || []) as unknown as SelectOption[],
        is_required: d.is_required,
        is_indexed: d.is_indexed,
        is_active: d.is_active,
        display_order: d.display_order,
        created_at: d.created_at,
        updated_at: d.updated_at,
      }));
    },
    enabled: true,
  });
}
