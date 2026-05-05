import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Merge, AlertTriangle } from "lucide-react";

type Strategy = "phone" | "email" | "name_cap";

interface DupGroup {
  group_key: string;
  contact_ids: string[];
  contact_count: number;
  sample_first_name: string | null;
  sample_last_name: string | null;
  sample_email: string | null;
  sample_phone: string | null;
}

export default function AdminContactsDedup() {
  const { currentBrand } = useBrandFilter();
  const brandId = currentBrand?.id;
  const [strategy, setStrategy] = useState<Strategy>("phone");
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["contacts-dedup", brandId, strategy],
    enabled: !!brandId,
    queryFn: async (): Promise<DupGroup[]> => {
      const { data, error } = await supabase.rpc("find_duplicate_contacts" as never, {
        p_brand_id: brandId,
        p_strategy: strategy,
        p_limit: 200,
      } as never);
      if (error) throw error;
      return (data as unknown as DupGroup[]) ?? [];
    },
  });

  const mergeMut = useMutation({
    mutationFn: async ({ targetId, sourceId }: { targetId: string; sourceId: string }) => {
      const { data, error } = await supabase.rpc("merge_contacts" as never, {
        p_target_id: targetId,
        p_source_id: sourceId,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Contatti uniti con successo");
      qc.invalidateQueries({ queryKey: ["contacts-dedup"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(`Merge fallito: ${e.message}`),
  });

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Deduplica contatti</h1>
        <p className="text-muted-foreground mt-1">
          Identifica e fonde contatti duplicati. Il contatto sorgente diventa una "tombstone" che punta al target; nessun dato viene cancellato.
        </p>
      </div>

      <Tabs value={strategy} onValueChange={(v) => setStrategy(v as Strategy)}>
        <TabsList>
          <TabsTrigger value="phone">Telefono</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="name_cap">Nome + CAP</TabsTrigger>
        </TabsList>

        <TabsContent value={strategy} className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Caricamento…" : `${data?.length ?? 0} gruppi di duplicati`}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Aggiorna
            </Button>
          </div>

          {(data ?? []).map((g) => (
            <Card key={g.group_key}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">
                    {g.sample_first_name} {g.sample_last_name}
                    {g.sample_email && <span className="text-muted-foreground font-normal"> · {g.sample_email}</span>}
                    {g.sample_phone && <span className="text-muted-foreground font-normal"> · {g.sample_phone}</span>}
                  </CardTitle>
                  <Badge variant="secondary">{g.contact_count} duplicati</Badge>
                </div>
                <CardDescription className="font-mono text-xs">{g.group_key}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {g.contact_ids.map((id, idx) => (
                  <div key={id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <div className="flex items-center gap-3">
                      <Badge variant={idx === 0 ? "default" : "outline"}>
                        {idx === 0 ? "Target (mantenuto)" : "Sorgente"}
                      </Badge>
                      <code className="text-xs">{id}</code>
                    </div>
                    {idx > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mergeMut.isPending}
                        onClick={() => {
                          if (
                            confirm(
                              `Unire questo contatto nel target?\n\nTarget: ${g.contact_ids[0]}\nSorgente: ${id}\n\nL'operazione non è reversibile automaticamente.`
                            )
                          ) {
                            mergeMut.mutate({ targetId: g.contact_ids[0], sourceId: id });
                          }
                        }}
                      >
                        <Merge className="mr-2 h-3 w-3" />
                        Unisci nel target
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          {!isLoading && (data?.length ?? 0) === 0 && (
            <Card>
              <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                Nessun duplicato trovato con la strategia selezionata.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
