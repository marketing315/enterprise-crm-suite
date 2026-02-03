import { useState, useEffect, useCallback } from "react";
import { PhoneIncoming, User, Briefcase, X, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIncomingCallsRealtime, useDismissIncomingCall, type IncomingCall } from "@/hooks/useVOIspeed";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface ContactInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export function IncomingCallPopup() {
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const dismissCall = useDismissIncomingCall();
  const navigate = useNavigate();

  const handleIncomingCall = useCallback(async (call: IncomingCall) => {
    setIncomingCall(call);

    // Fetch contact info if available
    if (call.contact_id) {
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("id", call.contact_id)
        .single();
      
      if (data) {
        setContactInfo(data);
      }
    } else {
      setContactInfo(null);
    }

    // Play notification sound (optional)
    try {
      const audio = new Audio("/notification.mp3");
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}

    // Auto-dismiss after 30 seconds if not interacted
    setTimeout(() => {
      setIncomingCall((current) => (current?.id === call.id ? null : current));
    }, 30000);
  }, []);

  useIncomingCallsRealtime(handleIncomingCall);

  const handleDismiss = () => {
    if (incomingCall) {
      dismissCall.mutate(incomingCall.id);
    }
    setIncomingCall(null);
    setContactInfo(null);
  };

  const handleOpenContact = () => {
    if (incomingCall?.contact_id) {
      navigate(`/contacts?selected=${incomingCall.contact_id}`);
    }
    handleDismiss();
  };

  const handleOpenDeal = () => {
    if (incomingCall?.deal_id) {
      navigate(`/pipeline?deal=${incomingCall.deal_id}`);
    }
    handleDismiss();
  };

  const handleCreateTicket = () => {
    if (incomingCall?.contact_id) {
      navigate(`/tickets?create=true&contact_id=${incomingCall.contact_id}`);
    }
    handleDismiss();
  };

  if (!incomingCall) return null;

  const contactName = contactInfo
    ? [contactInfo.first_name, contactInfo.last_name].filter(Boolean).join(" ") || "Contatto"
    : null;

  return (
    <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-2 duration-300">
      <Card className="w-80 shadow-2xl border-2 border-primary bg-background">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
              <PhoneIncoming className="h-5 w-5 text-primary animate-pulse" />
              Chiamata in arrivo
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-2xl font-bold tracking-wide">
              {incomingCall.phone_number}
            </p>
            {contactName ? (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                {contactName}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Numero non in rubrica
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {incomingCall.contact_id && (
              <Button
                variant="default"
                size="sm"
                onClick={handleOpenContact}
                className="w-full"
              >
                <User className="h-4 w-4 mr-2" />
                Apri Contatto
              </Button>
            )}

            {incomingCall.deal_id && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleOpenDeal}
                className="w-full"
              >
                <Briefcase className="h-4 w-4 mr-2" />
                Apri Trattativa
              </Button>
            )}

            {incomingCall.contact_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateTicket}
                className="w-full"
              >
                <Ticket className="h-4 w-4 mr-2" />
                Crea Ticket
              </Button>
            )}

            {!incomingCall.contact_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/contacts?create=true&phone=${encodeURIComponent(incomingCall.phone_number)}`)}
                className="w-full"
              >
                <User className="h-4 w-4 mr-2" />
                Crea Nuovo Contatto
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
