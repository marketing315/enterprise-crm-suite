/**
 * A6 — Admin Sessions audit page.
 *
 * Lists session events (signin/signout/token_refresh/password_reset/mfa_*).
 * Admin/CEO see everything; the page itself is RoleGuard-restricted in App.tsx
 * but the underlying RPC `list_session_events` enforces the same boundary.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

type EventFilter = "all" | "signin" | "signout" | "mfa_challenge_failed" | "mfa_challenge_success" | "mfa_enroll" | "password_reset" | "token_refresh";

interface SessionEvent {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
  metadata: Record<string, unknown> | null;
  revoked_at: string | null;
  created_at: string;
}

const EVENT_LABEL: Record<string, string> = {
  signin: "Accesso",
  signout: "Disconnessione",
  token_refresh: "Refresh token",
  password_reset: "Reset password",
  mfa_enroll: "MFA attivato",
  mfa_challenge_success: "MFA OK",
  mfa_challenge_failed: "MFA fallito",
  session_revoked: "Sessione revocata",
};

const EVENT_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  signin: "default",
  signout: "secondary",
  password_reset: "outline",
  mfa_enroll: "default",
  mfa_challenge_success: "default",
  mfa_challenge_failed: "destructive",
  session_revoked: "destructive",
};

export default function AdminSessions() {
  const qc = useQueryClient();
  const [eventType, setEventType] = useState<EventFilter>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-sessions", eventType],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_session_events", {
        p_user_id: undefined,
        p_event_type: eventType === "all" ? undefined : eventType,
        p_limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as SessionEvent[];
    },
    staleTime: 30_000,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("mark_session_revoked", {
        p_session_audit_id: id,
        p_reason: "Revoca manuale da pannello admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Sessione contrassegnata come revocata");
      qc.invalidateQueries({ queryKey: ["admin-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Audit sessioni</h1>
        <p className="text-muted-foreground mt-1">
          Eventi di accesso, disconnessione e MFA degli ultimi 90 giorni.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Eventi recenti</CardTitle>
          <Select value={eventType} onValueChange={(v) => setEventType(v as EventFilter)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli eventi</SelectItem>
              <SelectItem value="signin">Accessi</SelectItem>
              <SelectItem value="signout">Disconnessioni</SelectItem>
              <SelectItem value="mfa_challenge_failed">MFA falliti</SelectItem>
              <SelectItem value="mfa_challenge_success">MFA OK</SelectItem>
              <SelectItem value="mfa_enroll">MFA attivati</SelectItem>
              <SelectItem value="password_reset">Reset password</SelectItem>
              <SelectItem value="token_refresh">Refresh token</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Errore: {(error as Error).message}</p>
          ) : !data?.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nessun evento trovato.</p>
          ) : (
            <div className="space-y-2">
              {data.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={EVENT_VARIANT[ev.event_type] || "outline"}>
                        {EVENT_LABEL[ev.event_type] || ev.event_type}
                      </Badge>
                      {ev.revoked_at && (
                        <Badge variant="destructive" className="text-xs">
                          Revocata
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: it })}
                      </span>
                    </div>
                    <div className="text-sm font-medium truncate">
                      {ev.user_name || ev.user_email || ev.user_id}
                    </div>
                    {ev.user_agent && (
                      <div className="text-xs text-muted-foreground truncate" title={ev.user_agent}>
                        {ev.user_agent}
                      </div>
                    )}
                  </div>
                  {ev.event_type === "signin" && !ev.revoked_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revoke.mutate(ev.id)}
                      disabled={revoke.isPending}
                    >
                      <ShieldOff className="h-4 w-4 mr-1" />
                      Revoca
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-4">
        Nota: la revoca contrassegna l'evento come revocato nel registro di audit. L'invalidazione
        effettiva del refresh token richiede una signOut globale (Supabase Admin API).
      </p>
    </div>
  );
}
