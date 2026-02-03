import { useState } from "react";
import { Phone, PhoneCall, PhoneOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateCallLog, useUpdateCallLog } from "@/hooks/useCallLogs";
import { useVOIspeedConfig, useUserVOIspeedExt, useVOIspeedCall } from "@/hooks/useVOIspeed";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

interface ClickToCallButtonProps {
  contactId: string;
  phoneNumber: string;
  dealId?: string | null;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  showLabel?: boolean;
}

export function ClickToCallButton({
  contactId,
  phoneNumber,
  dealId,
  variant = "outline",
  size = "sm",
  className,
  showLabel = false,
}: ClickToCallButtonProps) {
  const [isDialerOpen, setIsDialerOpen] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "connected">("idle");
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);

  const { currentBrand } = useBrand();
  const createCallLog = useCreateCallLog();
  const updateCallLog = useUpdateCallLog();
  
  // VOIspeed integration
  const { data: voipConfig, isLoading: voipConfigLoading } = useVOIspeedConfig();
  const { data: userExt, isLoading: userExtLoading } = useUserVOIspeedExt();
  const voispeedCall = useVOIspeedCall();

  const isVOIspeedEnabled = !!voipConfig && !!userExt;
  const isLoading = voipConfigLoading || userExtLoading;

  const handleStartCall = async () => {
    if (!currentBrand?.id) {
      toast.error("Nessun brand selezionato");
      return;
    }

    // VOIspeed path: use edge function
    if (isVOIspeedEnabled) {
      try {
        setCallStatus("calling");
        setIsDialerOpen(true);
        setCallStartTime(new Date());

        const result = await voispeedCall.mutateAsync({
          phoneNumber,
          contactId,
          dealId,
          brandId: currentBrand.id,
        });

        setActiveCallId(result.call_log_id);
        // VOIspeed will update status via webhook
      } catch (error) {
        setCallStatus("idle");
        setIsDialerOpen(false);
      }
      return;
    }

    // Fallback: tel: protocol with manual tracking
    try {
      // Create call log
      const callLog = await createCallLog.mutateAsync({
        contact_id: contactId,
        phone_number: phoneNumber,
        deal_id: dealId,
      });

      setActiveCallId(callLog.id);
      setCallStatus("calling");
      setCallStartTime(new Date());
      setIsDialerOpen(true);

      // Open phone dialer (tel: protocol)
      window.location.href = `tel:${phoneNumber}`;

      // Update status to ringing
      await updateCallLog.mutateAsync({
        id: callLog.id,
        updates: { status: "ringing" },
      });

      toast.success("Chiamata avviata");
    } catch (error) {
      toast.error("Errore nell'avvio della chiamata");
    }
  };

  const handleEndCall = async () => {
    if (!activeCallId || !callStartTime) return;

    const endTime = new Date();
    const durationSeconds = Math.round((endTime.getTime() - callStartTime.getTime()) / 1000);

    try {
      await updateCallLog.mutateAsync({
        id: activeCallId,
        updates: {
          status: "completed",
          duration_seconds: durationSeconds,
          ended_at: endTime.toISOString(),
        },
      });

      toast.success(`Chiamata terminata (${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")})`);
    } catch (error) {
      console.error("Error updating call log:", error);
    }

    setActiveCallId(null);
    setCallStatus("idle");
    setCallStartTime(null);
    setIsDialerOpen(false);
  };

  const handleMarkConnected = async () => {
    if (!activeCallId) return;

    await updateCallLog.mutateAsync({
      id: activeCallId,
      updates: { status: "answered" },
    });

    setCallStatus("connected");
  };

  const handleMarkFailed = async (status: "failed" | "busy" | "no_answer") => {
    if (!activeCallId) return;

    await updateCallLog.mutateAsync({
      id: activeCallId,
      updates: { status, ended_at: new Date().toISOString() },
    });

    setActiveCallId(null);
    setCallStatus("idle");
    setCallStartTime(null);
    setIsDialerOpen(false);

    const labels = {
      failed: "Chiamata fallita",
      busy: "Occupato",
      no_answer: "Nessuna risposta",
    };
    toast.info(labels[status]);
  };

  const isPending = isLoading || createCallLog.isPending || voispeedCall.isPending;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleStartCall}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Phone className="h-4 w-4" />
        )}
        {showLabel && <span className="ml-1.5">Chiama</span>}
      </Button>

      <Dialog open={isDialerOpen} onOpenChange={setIsDialerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-primary" />
              Chiamata in corso
            </DialogTitle>
            <DialogDescription>
              Stai chiamando: <strong>{phoneNumber}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {callStatus === "calling" && (
              <div className="text-center space-y-4">
                <div className="text-lg font-medium animate-pulse">Chiamata in corso...</div>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleMarkConnected}>
                    Risposto
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleMarkFailed("no_answer")}>
                    Nessuna risposta
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleMarkFailed("busy")}>
                    Occupato
                  </Button>
                </div>
              </div>
            )}

            {callStatus === "connected" && (
              <div className="text-center space-y-4">
                <div className="text-lg font-medium text-primary">Connesso</div>
                <p className="text-sm text-muted-foreground">
                  La chiamata è in corso. Clicca "Termina" quando hai finito.
                </p>
              </div>
            )}

            <div className="flex justify-center">
              <Button
                variant="destructive"
                size="lg"
                className="rounded-full w-16 h-16"
                onClick={handleEndCall}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
