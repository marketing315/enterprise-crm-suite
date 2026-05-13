import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Plus, Link2 } from "lucide-react";
import { MetaAppsList } from "./MetaAppsList";
import { MetaAppFormDrawer } from "./MetaAppFormDrawer";
import { MetaPageConnectDialog } from "./MetaPageConnectDialog";

export function MetaAppsSettings() {
  const { hasRole } = useAuth();
  const { currentBrand } = useBrand();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  const isAdmin = currentBrand ? hasRole("admin", currentBrand.id) : false;
  const isCeo = hasRole("ceo");

  if (!isAdmin && !isCeo) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Solo gli amministratori e i CEO possono gestire le Meta App.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle>Meta Lead Ads</CardTitle>
          <CardDescription>
            Configura le integrazioni Meta Lead Ads per ogni brand
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setConnectOpen(true)}
            disabled={!currentBrand}
          >
            <Link2 className="h-4 w-4 mr-2" />
            Collega pagina (OAuth)
          </Button>
          <Button variant="outline" onClick={() => setDrawerOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Manuale
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <MetaAppsList />
      </CardContent>

      <MetaAppFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
      <MetaPageConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
      />
    </Card>
  );
}
