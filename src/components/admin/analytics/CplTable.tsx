import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { CplRow } from "@/hooks/useCplAnalytics";

interface Props {
  data: CplRow[];
  isLoading: boolean;
  groupBy: "campaign" | "group";
}

function matchBadge(type: string) {
  switch (type) {
    case "exact":
      return <Badge variant="default">Exact</Badge>;
    case "group":
      return <Badge variant="secondary">Group</Badge>;
    default:
      return <Badge variant="outline">Unmapped</Badge>;
  }
}

export function CplTable({ data, isLoading, groupBy }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nessun dato di attribuzione per il periodo selezionato.
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{groupBy === "campaign" ? "Campagna" : "Gruppo"}</TableHead>
            <TableHead>Tipo Match</TableHead>
            <TableHead className="text-right">Lead</TableHead>
            <TableHead className="text-right">Spesa</TableHead>
            <TableHead className="text-right">CPL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={`${row.entity_id ?? "unmapped"}-${i}`}>
              <TableCell className="font-medium">{row.entity_name}</TableCell>
              <TableCell>{matchBadge(row.match_type)}</TableCell>
              <TableCell className="text-right">{row.leads_count}</TableCell>
              <TableCell className="text-right">
                €{Number(row.total_spend).toFixed(2)}
              </TableCell>
              <TableCell className="text-right font-semibold">
                €{Number(row.cpl).toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
