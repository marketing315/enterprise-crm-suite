import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useEffect } from "react";

export interface VOIspeedConfig {
  id: string;
  brand_id: string;
  base_url: string;
  token: string;
  domain: string | null;
  enabled: boolean;
}

export interface IncomingCall {
  id: string;
  brand_id: string;
  user_id: string;
  contact_id: string | null;
  deal_id: string | null;
  call_log_id: string | null;
  phone_number: string;
  voispeed_ext: string | null;
  provider_call_id: string | null;
  status: "ringing" | "answered" | "dismissed" | "missed";
  created_at: string;
}

// Check if VOIspeed is configured for the current brand
export function useVOIspeedConfig() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["voispeed-config", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return null;

      // Use untyped client for new table (not yet in generated types)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { data, error } = await client
        .from("voispeed_configs")
        .select("id, brand_id, base_url, domain, enabled")
        .eq("brand_id", currentBrand.id)
        .eq("enabled", true)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching VOIspeed config:", error);
        return null;
      }

      return data as VOIspeedConfig | null;
    },
    enabled: !!currentBrand?.id,
  });
}

// Check if current user has VOIspeed extension configured
export function useUserVOIspeedExt() {
  const { supabaseUser } = useAuth();

  return useQuery({
    queryKey: ["user-voispeed-ext", supabaseUser?.id],
    queryFn: async () => {
      if (!supabaseUser?.id) return null;

      const { data, error } = await supabase
        .from("users")
        .select("voispeed_ext")
        .eq("supabase_auth_id", supabaseUser.id)
        .single();

      if (error) {
        console.error("Error fetching user VOIspeed ext:", error);
        return null;
      }

      return data?.voispeed_ext as string | null;
    },
    enabled: !!supabaseUser?.id,
  });
}

// Initiate a VOIspeed call via edge function
export function useVOIspeedCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      phoneNumber,
      contactId,
      dealId,
      brandId,
    }: {
      phoneNumber: string;
      contactId: string;
      dealId?: string | null;
      brandId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("voispeed-call-request", {
        body: {
          phone_number: phoneNumber,
          contact_id: contactId,
          deal_id: dealId,
          brand_id: brandId,
        },
      });

      if (error) throw error;
      
      if (data?.error) {
        throw new Error(data.error);
      }

      return data as { success: boolean; call_log_id: string; ext_id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-logs"] });
      toast.success("Chiamata avviata - il tuo telefono squillerà a breve");
    },
    onError: (error: Error) => {
      console.error("VOIspeed call error:", error);
      
      if (error.message.includes("VOISPEED_EXT_MISSING")) {
        toast.error("Interno VOIspeed non configurato. Contatta l'amministratore.");
      } else if (error.message.includes("VOISPEED_NOT_CONFIGURED")) {
        toast.error("VOIspeed non configurato per questo brand");
      } else {
        toast.error(`Errore chiamata: ${error.message}`);
      }
    },
  });
}

// Subscribe to incoming calls for screen-pop
export function useIncomingCallsRealtime(onIncomingCall: (call: IncomingCall) => void) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    // user.id is already the CRM user ID (from users table)
    const setupSubscription = async () => {
      const crmUserId = user.id;

      const channel = supabase
        .channel("incoming-calls")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "incoming_calls",
            filter: `user_id=eq.${crmUser.id}`,
          },
          (payload) => {
            const call = payload.new as IncomingCall;
            if (call.status === "ringing") {
              onIncomingCall(call);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    const cleanup = setupSubscription();
    return () => {
      cleanup.then((fn) => fn?.());
    };
  }, [user?.id, onIncomingCall]);
}

// Dismiss an incoming call notification
export function useDismissIncomingCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { error } = await client
        .from("incoming_calls")
        .update({
          status: "dismissed",
          dismissed_at: new Date().toISOString(),
        })
        .eq("id", callId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incoming-calls"] });
    },
  });
}
