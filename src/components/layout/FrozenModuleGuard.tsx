import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useModuleFlag, useAutoTrackModule, type ModuleStatus } from "@/hooks/useFeatureFlags";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Snowflake, ArrowLeft, Search } from "lucide-react";

interface FrozenModuleGuardProps {
  moduleKey: string;
  children: React.ReactNode;
}

const STATUS_CONFIG: Record<ModuleStatus, { show: boolean; badge: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { show: false, badge: "", variant: "default" },
  maintain: { show: false, badge: "", variant: "default" },
  evaluate: { show: false, badge: "In valutazione", variant: "secondary" },
  frozen: { show: true, badge: "Sospeso", variant: "destructive" },
  sunset: { show: true, badge: "Dismesso", variant: "destructive" },
};

export function FrozenModuleGuard({ moduleKey, children }: FrozenModuleGuardProps) {
  const flag = useModuleFlag(moduleKey);
  const navigate = useNavigate();
  const status = flag?.status ?? "active";
  const config = STATUS_CONFIG[status];

  // Track usage even for evaluate modules
  useAutoTrackModule(status === "evaluate" || status === "active" || status === "maintain" ? moduleKey : null);

  if (!config.show) {
    return (
      <>
        {status === "evaluate" && (
          <div className="mb-4">
            <Badge variant="secondary" className="gap-1.5">
              <Search className="h-3 w-3" />
              {config.badge} — l'utilizzo di questo modulo è monitorato
            </Badge>
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Snowflake className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Modulo {status === "sunset" ? "dismesso" : "sospeso"}</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <Badge variant={config.variant}>{flag?.module_label ?? moduleKey}</Badge>
          <p className="text-muted-foreground">
            {flag?.frozen_message || "Questo modulo è temporaneamente disattivato per ottimizzare le risorse."}
          </p>
          <p className="text-sm text-muted-foreground">
            La decisione è reversibile dal pannello amministrazione in Impostazioni → Moduli.
          </p>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate(flag?.frozen_redirect || "/dashboard")}
          >
            <ArrowLeft className="h-4 w-4" />
            Torna alla dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
