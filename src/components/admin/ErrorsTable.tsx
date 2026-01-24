import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import type { AIMetricsError } from "@/hooks/useAIMetrics";

interface ErrorsTableProps {
  errors: AIMetricsError[];
}

export function ErrorsTable({ errors }: ErrorsTableProps) {
  if (errors.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Errori</CardTitle>
          <CardDescription>Errori più frequenti nel periodo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Nessun errore nel periodo selezionato 🎉
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top Errori</CardTitle>
        <CardDescription>Errori più frequenti nel periodo</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Errore</TableHead>
              <TableHead className="text-right">Occorrenze</TableHead>
              <TableHead className="text-right">Ultima volta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errors.map((error, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">
                    {error.error}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {error.count}
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-sm">
                  {formatDistanceToNow(new Date(error.last_occurrence), {
                    addSuffix: true,
                    locale: it,
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
