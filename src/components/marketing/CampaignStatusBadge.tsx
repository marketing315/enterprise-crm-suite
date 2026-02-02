import { Badge } from "@/components/ui/badge";
import type { MarketingCampaignStatus } from "@/types/marketing";

interface CampaignStatusBadgeProps {
  status: MarketingCampaignStatus;
}

const statusConfig: Record<MarketingCampaignStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  planned: { label: "Pianificata", variant: "secondary" },
  active: { label: "Attiva", variant: "default" },
  paused: { label: "In Pausa", variant: "outline" },
  closed: { label: "Chiusa", variant: "destructive" },
};

export function CampaignStatusBadge({ status }: CampaignStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.planned;
  
  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}
