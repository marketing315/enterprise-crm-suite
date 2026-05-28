import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ListTree, Phone, Users, ChevronRight, Info } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { supabase } from "@/integrations/supabase/client";

type IvrNode = {
  id: string;
  voispeed_ivr_id: string;
  name: string;
  parent_id: string | null;
  routes_to_queue: string | null;
  routes_to_ext: string | null;
  synced_at: string | null;
};

type IvrTreeNode = IvrNode & { children: IvrTreeNode[] };

function buildTree(nodes: IvrNode[]): IvrTreeNode[] {
  const byId = new Map<string, IvrTreeNode>();
  nodes.forEach((n) => byId.set(n.id, { ...n, children: [] }));
  const roots: IvrTreeNode[] = [];
  byId.forEach((n) => {
    if (n.parent_id && byId.has(n.parent_id)) {
      byId.get(n.parent_id)!.children.push(n);
    } else {
      roots.push(n);
    }
  });
  const sortRec = (arr: IvrTreeNode[]) => {
    arr.sort((a, b) => a.name.localeCompare(b.name));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function NodeRow({ node, depth }: { node: IvrTreeNode; depth: number }) {
  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {node.children.length > 0 ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <ListTree className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{node.name}</span>
        <code className="text-[10px] text-muted-foreground font-mono">#{node.voispeed_ivr_id}</code>
        <div className="ml-auto flex items-center gap-1.5">
          {node.routes_to_queue && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Users className="h-3 w-3" />
              {node.routes_to_queue}
            </Badge>
          )}
          {node.routes_to_ext && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Phone className="h-3 w-3" />
              {node.routes_to_ext}
            </Badge>
          )}
        </div>
      </div>
      {node.children.map((c) => (
        <NodeRow key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export function VoispeedIvrTree() {
  const { currentBrand } = useBrand();

  const { data, isLoading, error } = useQuery({
    queryKey: ["voispeed-ivr-nodes", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return [] as IvrNode[];
      const { data, error } = await supabase
        .from("voispeed_ivr_nodes")
        .select("id,voispeed_ivr_id,name,parent_id,routes_to_queue,routes_to_ext,synced_at")
        .eq("brand_id", currentBrand.id)
        .order("name", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as IvrNode[];
    },
    enabled: !!currentBrand?.id,
  });

  const tree = useMemo(() => buildTree(data ?? []), [data]);
  const lastSync = useMemo(() => {
    const ts = (data ?? [])
      .map((n) => n.synced_at)
      .filter(Boolean)
      .sort()
      .pop();
    return ts ? new Date(ts).toLocaleString("it-IT") : null;
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListTree className="h-5 w-5" />
          Centralino avanzato — Albero IVR
        </CardTitle>
        <CardDescription>
          Vista read-only dell'albero IVR sincronizzato da VoiSpeed (sync giornaliero).
          {lastSync && (
            <span className="block text-xs mt-1">Ultimo sync nodi: {lastSync}</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Errore nel caricamento dell'albero IVR: {error instanceof Error ? error.message : String(error)}
            </AlertDescription>
          </Alert>
        ) : tree.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Nessun nodo IVR sincronizzato. Configura il <code>Service IVR tree</code> nella sezione VoiSpeed
              e attendi il cron giornaliero (03:17 UTC) oppure attiva l'integrazione e verifica le credenziali SERI.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="border border-border rounded-md max-h-[480px] overflow-auto bg-card/30">
            {tree.map((root) => (
              <NodeRow key={root.id} node={root} depth={0} />
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          {data?.length ?? 0} nodi totali — modifiche disponibili solo dal pannello VoiSpeed (sorgente di verità).
        </p>
      </CardContent>
    </Card>
  );
}
