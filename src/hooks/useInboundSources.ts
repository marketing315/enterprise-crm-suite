 import { useQuery } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useBrand } from "@/contexts/BrandContext";
 
 export interface InboundSource {
   id: string;
   name: string;
   description: string | null;
   is_active: boolean;
   rate_limit_per_min: number;
   hmac_enabled: boolean;
   replay_window_seconds: number;
   created_at: string;
   updated_at: string;
 }
 
export function useInboundSources() {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ["inbound-sources", isAllBrandsSelected ? "all" : currentBrand?.id],
    queryFn: async (): Promise<InboundSource[]> => {
      if (!isAllBrandsSelected && !currentBrand?.id) return [];
      if (isAllBrandsSelected && allBrandIds.length === 0) return [];

      let query = supabase
        .from("webhook_sources_safe")
        .select("id, name, description, is_active, rate_limit_per_min, hmac_enabled, replay_window_seconds, created_at, updated_at")
        .order("name", { ascending: true });

      if (isAllBrandsSelected) {
        query = query.in("brand_id", allBrandIds);
      } else {
        query = query.eq("brand_id", currentBrand!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as InboundSource[];
    },
    enabled: isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand?.id,
  });
}
 
 /**
  * Hook to get automation event types including dynamic inbound sources
  */
 export function useAutomationEventTypes() {
   const { data: inboundSources } = useInboundSources();
 
   // Static event types
   const staticEventTypes = [
     // Keplero events
     { value: "keplero.ricontatto", label: "Keplero - Ricontatto" },
     { value: "keplero.appuntamento", label: "Keplero - Appuntamento" },
     { value: "keplero.rifiuto", label: "Keplero - Rifiuto" },
     { value: "keplero.lead", label: "Keplero - Nuovo Lead" },
     { value: "keplero.*", label: "Keplero - Tutti gli eventi" },
     // Meta events
     { value: "meta.lead", label: "Meta Lead Ads" },
     // VOIspeed events
     { value: "voispeed.call_start", label: "VOIspeed - Inizio Chiamata" },
     { value: "voispeed.call_end", label: "VOIspeed - Fine Chiamata" },
     { value: "voispeed.call_answered", label: "VOIspeed - Chiamata Risposta" },
     { value: "voispeed.call_missed", label: "VOIspeed - Chiamata Persa" },
     { value: "voispeed.*", label: "VOIspeed - Tutti gli eventi" },
   ];
 
   // Dynamic inbound sources
   const inboundEventTypes = (inboundSources || []).map((source) => ({
     value: `inbound.${source.name}`,
     label: `Inbound - ${source.name}`,
     sourceId: source.id,
     sourceName: source.name,
   }));
 
   // Add wildcard at the end
   const allEventTypes = [
     ...staticEventTypes,
     ...inboundEventTypes,
     { value: "inbound.*", label: "Inbound - Tutti i webhook" },
   ];
 
   return {
     eventTypes: allEventTypes,
     inboundSources: inboundSources || [],
   };
 }