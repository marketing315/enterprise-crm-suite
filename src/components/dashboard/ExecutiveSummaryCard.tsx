import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, ExternalLink, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export function ExecutiveSummaryCard() {
  const { currentBrand } = useBrand();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: report, isLoading } = useQuery({
    queryKey: ["executive-report", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand) return null;

      const { data, error } = await supabase
        .from("executive_reports")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .eq("report_type", "weekly")
        .order("period_end", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!currentBrand,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Report Settimanale
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Nessun report disponibile. Il prossimo report verrà generato automaticamente lunedì.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Extract first 3 lines for preview
  const lines = report.content_markdown.split("\n").filter(Boolean);
  const previewLines = lines.slice(0, 5).join("\n");

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Report Settimanale
            </CardTitle>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(report.period_end), "d MMM yyyy", { locale: it })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm prose prose-sm dark:prose-invert max-w-none line-clamp-4">
            <ReactMarkdown>{previewLines}</ReactMarkdown>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setIsDialogOpen(true)}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Leggi tutto
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Report Settimanale - {format(new Date(report.period_start), "d MMM", { locale: it })} / {format(new Date(report.period_end), "d MMM yyyy", { locale: it })}
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{report.content_markdown}</ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
