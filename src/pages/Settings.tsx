import { Settings as SettingsIcon, Tags } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagManager } from "@/components/tags/TagManager";
import { useBrand } from "@/contexts/BrandContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function Settings() {
  const { currentBrand, hasBrandSelected } = useBrand();

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per accedere alle impostazioni.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <SettingsIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Impostazioni</h1>
          <p className="text-sm text-muted-foreground">
            Configura {currentBrand?.name}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tags" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tags" className="gap-2">
            <Tags className="h-4 w-4" />
            Tag
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tags" className="space-y-4">
          <TagManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
