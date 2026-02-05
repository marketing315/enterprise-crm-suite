 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Copy, ExternalLink, Check } from "lucide-react";
 import { useState } from "react";
 import { toast } from "sonner";
 
 const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
 
 interface EndpointInfo {
   name: string;
   description: string;
   endpoint: string;
   configLocation?: string;
   configPath?: string;
   status: "fixed" | "configurable";
   docLink?: string;
 }
 
 const ENDPOINTS: EndpointInfo[] = [
   {
     name: "Keplero",
     description: "Riceve appuntamenti e lead dall'AI WhatsApp di Keplero",
     endpoint: `${SUPABASE_URL}/functions/v1/keplero-webhook`,
     status: "fixed",
     docLink: "/docs/keplero-integration.md",
   },
   {
     name: "Meta Lead Ads",
     description: "Riceve lead da Facebook e Instagram Lead Ads in tempo reale",
     endpoint: `${SUPABASE_URL}/functions/v1/meta-leads-webhook/{brand-slug}`,
     configLocation: "Impostazioni → Meta Lead Ads",
     status: "configurable",
     docLink: "/docs/meta-lead-ads.md",
   },
   {
     name: "Inbound Generico",
     description: "Riceve dati da qualsiasi sorgente esterna (Gravity Forms, Zapier, etc.)",
     endpoint: `${SUPABASE_URL}/functions/v1/webhook-ingest/{source-name}`,
     configLocation: "Tab \"Inbound\" qui sotto",
     status: "configurable",
     docLink: "/docs/inbound-webhooks.md",
   },
   {
     name: "VOIspeed Events",
     description: "Riceve eventi chiamata dal centralino VOIspeed",
     endpoint: `${SUPABASE_URL}/functions/v1/voispeed-events-webhook`,
     configLocation: "Impostazioni → VoIP",
     status: "configurable",
     docLink: "/docs/voispeed-integration.md",
   },
 ];
 
 export function WebhookEndpointsOverview() {
   const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
 
   const handleCopy = async (text: string, index: number) => {
     await navigator.clipboard.writeText(text);
     setCopiedIndex(index);
     toast.success("URL copiato!");
     setTimeout(() => setCopiedIndex(null), 2000);
   };
 
   return (
     <Card className="mb-6">
       <CardHeader className="pb-3">
         <CardTitle className="text-lg">Endpoint Webhook Disponibili</CardTitle>
         <CardDescription>
           Panoramica di tutti gli endpoint per ricevere dati da sistemi esterni
         </CardDescription>
       </CardHeader>
       <CardContent>
         <div className="space-y-3">
           {ENDPOINTS.map((ep, index) => (
             <div
               key={ep.name}
               className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border bg-muted/30"
             >
               <div className="flex-1 min-w-0">
                 <div className="flex items-center gap-2 mb-1">
                   <span className="font-medium">{ep.name}</span>
                   <Badge variant={ep.status === "fixed" ? "default" : "secondary"} className="text-xs">
                     {ep.status === "fixed" ? "Fisso" : "Configurabile"}
                   </Badge>
                 </div>
                 <p className="text-sm text-muted-foreground mb-1">{ep.description}</p>
                 <code className="text-xs bg-muted px-2 py-1 rounded break-all block">
                   {ep.endpoint}
                 </code>
                 {ep.configLocation && (
                   <p className="text-xs text-muted-foreground mt-1">
                     📍 Configura in: <span className="font-medium">{ep.configLocation}</span>
                   </p>
                 )}
               </div>
               <div className="flex items-center gap-2 shrink-0">
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={() => handleCopy(ep.endpoint, index)}
                 >
                   {copiedIndex === index ? (
                     <Check className="h-4 w-4" />
                   ) : (
                     <Copy className="h-4 w-4" />
                   )}
                 </Button>
                 {ep.docLink && (
                   <Button
                     variant="ghost"
                     size="sm"
                     asChild
                   >
                     <a href={ep.docLink} target="_blank" rel="noopener noreferrer">
                       <ExternalLink className="h-4 w-4" />
                     </a>
                   </Button>
                 )}
               </div>
             </div>
           ))}
         </div>
       </CardContent>
     </Card>
   );
 }