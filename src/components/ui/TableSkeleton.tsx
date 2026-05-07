import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  /** Optional column labels to render in header (otherwise generic skeletons) */
  headers?: string[];
  className?: string;
}

/**
 * Skeleton uniforme per tabelle in caricamento.
 * Sostituisce gli spinner generici nelle pagine list/admin per dare percezione di velocità.
 */
export function TableSkeleton({ rows = 6, columns = 5, headers, className }: TableSkeletonProps) {
  const cols = headers?.length ?? columns;
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {Array.from({ length: cols }).map((_, i) => (
            <TableHead key={i}>
              {headers?.[i] ?? <Skeleton className="h-4 w-20" />}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, r) => (
          <TableRow key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <TableCell key={c}>
                <Skeleton className="h-4" style={{ width: `${40 + ((r + c) % 5) * 12}%` }} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
