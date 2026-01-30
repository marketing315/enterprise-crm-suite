import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import type { PipelineStage } from "@/types/database";

export function usePipelineStagesAdmin() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["pipeline-stages-admin", currentBrand?.id],
    queryFn: async (): Promise<PipelineStage[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("order_index", { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as PipelineStage[];
    },
    enabled: !!currentBrand,
  });
}

export function useCreatePipelineStage() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      if (!currentBrand) throw new Error("No brand selected");

      const { data, error } = await supabase.rpc("create_pipeline_stage", {
        p_brand_id: currentBrand.id,
        p_name: name,
        p_color: color || "#6366f1",
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages-admin"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
      toast.success("Fase creata con successo");
    },
    onError: (error: Error) => {
      console.error("Error creating pipeline stage:", error);
      if (error.message.includes("duplicate")) {
        toast.error("Esiste già una fase con questo nome");
      } else {
        toast.error(error.message || "Errore nella creazione della fase");
      }
    },
  });
}

export function useUpdatePipelineStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stageId,
      name,
      color,
      description,
    }: {
      stageId: string;
      name?: string;
      color?: string;
      description?: string;
    }) => {
      const { error } = await supabase.rpc("update_pipeline_stage", {
        p_stage_id: stageId,
        p_name: name || null,
        p_color: color || null,
        p_description: description || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages-admin"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
      toast.success("Fase aggiornata");
    },
    onError: (error: Error) => {
      console.error("Error updating pipeline stage:", error);
      if (error.message.includes("duplicate")) {
        toast.error("Esiste già una fase con questo nome");
      } else {
        toast.error(error.message || "Errore nell'aggiornamento della fase");
      }
    },
  });
}

export function useReorderPipelineStages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stageIds: string[]) => {
      const { error } = await supabase.rpc("reorder_pipeline_stages", {
        p_stage_ids: stageIds,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages-admin"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
    },
    onError: (error: Error) => {
      console.error("Error reordering pipeline stages:", error);
      toast.error("Errore nel riordinamento delle fasi");
    },
  });
}

export function useDeactivatePipelineStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stageId,
      fallbackStageId,
    }: {
      stageId: string;
      fallbackStageId: string;
    }) => {
      const { data, error } = await supabase.rpc("deactivate_pipeline_stage", {
        p_stage_id: stageId,
        p_fallback_stage_id: fallbackStageId,
      });

      if (error) throw error;
      return data as { success: boolean; stage_name: string; fallback_name: string; deals_moved: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages-admin"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success(
        `Fase "${data.stage_name}" disattivata. ${data.deals_moved} deal spostati in "${data.fallback_name}"`
      );
    },
    onError: (error: Error) => {
      console.error("Error deactivating pipeline stage:", error);
      toast.error(error.message || "Errore nella disattivazione della fase");
    },
  });
}
