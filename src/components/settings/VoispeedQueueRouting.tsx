/**
 * F6 Step #5 — Centralino avanzato: stato code & instradamento live.
 *
 * Mostra:
 *  - Snapshot live agenti + code (riuso LiveAgentsPanel)
 *  - Matrice instradamento: per ogni coda, agenti loggati + nodi IVR che vi puntano
 *  - Instradamento per estensione (DID/IVR → ext)
 *
 * Tutto read-only: i dati arrivano da `voispeed-status-poll` (cron 1min)
 * e `voispeed-ivr-sync` (cron giornaliero).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ListTree, Users, PhoneForwarded, Network } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { LiveAgentsPanel } from "@/components/callcenter/LiveAgentsPanel";
import { useVoispeedAgents } from "@/hooks/useVoispeedLive";

interface IvrRoutingRow {
  id: string;
  voispeed_ivr_id: string;
  name: string;
  routes_to_queue: string | null;
  routes_to_ext: string | null;
}

export function VoispeedQueueRouting() {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id ?? null;

  const agentsQ = useVoispeedAgents(brandId);

  const ivrQ = useQuery({
    queryKey: ["voispeed-ivr-routing", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<IvrRoutingRow[]> => {
      const { data, error } = await supabase
        .from("voispeed_ivr_nodes")
        .select("id, voispeed_ivr_id, name, routes_to_queue, routes_to_ext")
        .eq("brand_id", brandId!)
        .or("routes_to_queue.not.is.null,routes_to_ext.not.is.null")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as IvrRoutingRow[];
    },
  });

  const byQueue = useMemo(() => {
    const map = new Map<string, { agents: string[]; ivrNodes: IvrRoutingRow[] }>();
    for (const a of agentsQ.data ?? []) {
      if (!a.queue_name) continue;
      const e = map.get(a.queue_name) ?? { agents: [], ivrNodes: [] };
      e.agents.push(a.voispeed_ext);
      map.set(a.queue_name, e);
    }
    for (const n of ivrQ.data ?? []) {
      if (!n.routes_to_queue) continue;
      const e = map.get(n.routes_to_queue) ?? { agents: [], ivrNodes: [] };
      e.ivrNodes.push(n);
      map.set(n.routes_to_queue, e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [agentsQ.data, ivrQ.data]);

  const ivrByExt = useMemo(
    () => (ivrQ.data ?? []).filter((n) => !!n.routes_to_ext),
    [ivrQ.data],
  );

  if (!brandId) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground text-center">
          Seleziona un brand per visualizzare il centralino avanzato.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" /> Centralino avanzato · Live
          </CardTitle>
          <CardDescription>
            Stato agenti, code e instradamento aggiornati in tempo reale dal poller VoiSpeed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LiveAgentsPanel brandId={brandId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Instradamento per coda
          </CardTitle>
          <CardDescription>
            Agenti attualmente loggati e nodi IVR che indirizzano traffico verso ciascuna coda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agentsQ.isLoading || ivrQ.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : byQueue.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Nessuna coda con agenti o nodi IVR mappati.
            </div>
          ) : (
            <div className="space-y-3">
              {byQueue.map(([queue, info]) => (
                <div key={queue} className="rounded-md border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{queue}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <Users className="h-3 w-3" /> {info.agents.length} agenti
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        <ListTree className="h-3 w-3" /> {info.ivrNodes.length} IVR
                      </Badge>
                    </div>
                  </div>
                  {info.agents.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {info.agents.map((ext) => (
                        <Badge key={ext} variant="outline" className="text-xs">
                          Ext {ext}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {info.ivrNodes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {info.ivrNodes.map((n) => (
                        <Badge key={n.id} variant="secondary" className="text-xs gap-1">
                          <ListTree className="h-3 w-3" />
                          {n.name}
                          <span className="text-muted-foreground">· {n.voispeed_ivr_id}</span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneForwarded className="h-5 w-5" /> Instradamento diretto per estensione
          </CardTitle>
          <CardDescription>
            Nodi IVR che bypassano le code e inoltrano direttamente a un interno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ivrQ.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : ivrByExt.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Nessun nodo IVR mappato direttamente a un'estensione.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ivrByExt.map((n) => (
                <div key={n.id} className="rounded-md border p-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{n.name}</div>
                    <div className="text-xs text-muted-foreground">{n.voispeed_ivr_id}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0 gap-1">
                    <PhoneForwarded className="h-3 w-3" />
                    {n.routes_to_ext}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
