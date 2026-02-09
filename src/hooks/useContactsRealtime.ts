import { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface ContactRow {
  id: string;
  brand_id: string;
}

/**
 * Subscribes to realtime changes on contacts & contact_phones tables.
 * On any INSERT / UPDATE / DELETE the relevant React-Query caches are
 * invalidated so every open browser sees the change instantly.
 */
export function useContactsRealtime() {
  const queryClient = useQueryClient();
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  const isInScope = useCallback(
    (brandId: string) => {
      if (isAllBrandsSelected) return allBrandIds.includes(brandId);
      return brandId === currentBrand?.id;
    },
    [isAllBrandsSelected, allBrandIds, currentBrand?.id]
  );

  const invalidateContacts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
    queryClient.invalidateQueries({ queryKey: ["contact-search"] });
    queryClient.invalidateQueries({ queryKey: ["lead-events"] });
  }, [queryClient]);

  const handleContactChange = useCallback(
    (payload: RealtimePostgresChangesPayload<ContactRow>) => {
      const row = (payload.new ?? payload.old) as ContactRow | undefined;
      if (!row?.brand_id) {
        // DELETE only has old record, always invalidate
        invalidateContacts();
        return;
      }
      if (!isInScope(row.brand_id)) return;

      invalidateContacts();

      // Also invalidate single-contact cache
      if (row.id) {
        queryClient.invalidateQueries({ queryKey: ["contact", row.id] });
      }
    },
    [isInScope, invalidateContacts, queryClient]
  );

  const handlePhoneChange = useCallback(() => {
    // Phone changes affect contact display, invalidate all
    invalidateContacts();
  }, [invalidateContacts]);

  useEffect(() => {
    if (!currentBrand?.id) return;

    const brandFilter = isAllBrandsSelected
      ? undefined
      : `brand_id=eq.${currentBrand.id}`;

    const suffix = isAllBrandsSelected ? "all" : currentBrand.id;

    const contactsChannel = supabase
      .channel(`contacts-rt-${suffix}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
          ...(brandFilter ? { filter: brandFilter } : {}),
        },
        handleContactChange
      )
      .subscribe();

    const phonesChannel = supabase
      .channel(`contact-phones-rt-${suffix}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contact_phones",
          ...(brandFilter ? { filter: brandFilter } : {}),
        },
        handlePhoneChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(contactsChannel);
      supabase.removeChannel(phonesChannel);
    };
  }, [currentBrand?.id, isAllBrandsSelected, handleContactChange, handlePhoneChange]);
}
