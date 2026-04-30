import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, Tag as TagIcon, Link2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface Attribution {
  appointment_id: string;
  contact_id: string;
  lead_event_id: string | null;
  lead_event_at: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  campaign_external_id: string | null;
  group_id: string | null;
  match_type: string | null;
  channel_id: string | null;
  matched_at: string | null;
}

export function AppointmentCampaignAttributionCard({ appointmentId }: { appointmentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["appointment-campaign-attribution", appointmentId],
    enabled: !!appointmentId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_appointment_campaign_attribution" as never,
        { p_appointment_id: appointmentId } as never
      );
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as Attribution | null;
    },
  });

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-background/60 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Campagna marketing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-5 w-48" />
        </CardContent>
      </Card>
    );
  }

  // Hide if no campaign and no lead event found (avoid noise)
  if (!data || (!data.campaign_id && !data.lead_event_id)) {
    return null;
  }

  return (
    <Card className="border-border/50 bg-background/60 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Megaphone className="h-4 w-4" /> Campagna marketing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.campaign_name ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{data.campaign_name}</span>
            {data.match_type && (
              <Badge variant={data.match_type === "exact" ? "default" : "secondary"} className="text-xs">
                {data.match_type === "exact"
                  ? "match esatto"
                  : data.match_type === "group"
                  ? "via gruppo"
                  : "non mappato"}
              </Badge>
            )}
            {data.campaign_external_id && (
              <Badge variant="outline" className="text-xs font-mono">
                <TagIcon className="h-3 w-3 mr-1" />
                {data.campaign_external_id}
              </Badge>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Lead event trovato ma senza attribuzione campagna
          </p>
        )}

        {data.lead_event_at && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            Originato da lead{" "}
            {formatDistanceToNow(new Date(data.lead_event_at), { locale: it, addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
