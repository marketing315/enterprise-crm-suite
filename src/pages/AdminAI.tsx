import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Building2, Brain, Zap, MessageSquare, Award, DollarSign } from "lucide-react";

import { AIOverviewTab } from "@/components/admin/ai/AIOverviewTab";
import { AIDecisionServiceTab } from "@/components/admin/ai/AIDecisionServiceTab";
import { AIChatTab } from "@/components/admin/ai/AIChatTab";
import { AIQualityTab } from "@/components/admin/ai/AIQualityTab";
import { AIPerformanceTab } from "@/components/admin/ai/AIPerformanceTab";

const tabs = [
  { id: "overview", label: "Panoramica", icon: Brain },
  { id: "decision", label: "Decision Service", icon: Zap },
  { id: "chat", label: "AI Chat", icon: MessageSquare },
  { id: "quality", label: "Valutazione", icon: Award },
  { id: "performance", label: "Costi & Performance", icon: DollarSign },
];

export default function AdminAI() {
  const { isAdmin, isCeo } = useAuth();
  const { hasBrandSelected, currentBrand } = useBrand();
  const [activeTab, setActiveTab] = useState("overview");

  // Access control: only admin and ceo
  if (!isAdmin && !isCeo) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!hasBrandSelected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Building2 className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl md:text-2xl font-bold mb-2">Seleziona un Brand</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Utilizza il selettore nella sidebar per scegliere il brand.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary/10">
            <Brain className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold">Gestione AI</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Configurazione e monitoraggio AI · {currentBrand?.name}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <ScrollArea className="w-full">
          <TabsList className="inline-flex h-10 w-max min-w-full gap-1 p-1">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="gap-2 px-3 data-[state=active]:bg-background"
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="overview" className="mt-4">
          <AIOverviewTab />
        </TabsContent>

        <TabsContent value="decision" className="mt-4">
          <AIDecisionServiceTab />
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <AIChatTab />
        </TabsContent>

        <TabsContent value="quality" className="mt-4">
          <AIQualityTab />
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <AIPerformanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
