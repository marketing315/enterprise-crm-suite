import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const SW_PATH = "/push-sw.js";

export function useWebPush() {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);
    if (!supported) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermissionState);

    // Check existing subscription
    navigator.serviceWorker
      .getRegistration(SW_PATH)
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(!!sub))
      .catch(() => setIsSubscribed(false));
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) return false;
    setLoading(true);
    try {
      // 1) Permission
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== "granted") return false;

      // 2) Register dedicated SW (does not conflict with vite-plugin-pwa's sw.js)
      const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
      await navigator.serviceWorker.ready;

      // 3) Get VAPID public key from edge function
      const { data: keyData, error: keyErr } = await supabase.functions.invoke(
        "web-push-public-key",
        { method: "GET" },
      );
      if (keyErr || !keyData?.publicKey) {
        console.error("[useWebPush] cannot fetch VAPID key", keyErr);
        return false;
      }

      // 4) Subscribe via PushManager
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });

      const json = sub.toJSON() as {
        endpoint: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const p256dh = json.keys?.p256dh ?? "";
      const auth = json.keys?.auth ?? "";

      if (!p256dh || !auth) {
        console.error("[useWebPush] missing keys from subscription");
        return false;
      }

      // 5) Persist (upsert by endpoint)
      const { data: userRes } = await supabase.auth.getUser();
      const authUid = userRes.user?.id;
      if (!authUid) return false;

      // Map to internal user_id
      const { data: internal } = await supabase.rpc("get_user_id", {
        p_auth_id: authUid,
      });
      const internalId = internal as unknown as string | null;
      if (!internalId) {
        console.error("[useWebPush] internal user id missing");
        return false;
      }

      const { error: upsertErr } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: internalId,
            endpoint: json.endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent.slice(0, 500),
          },
          { onConflict: "endpoint" },
        );

      if (upsertErr) {
        console.error("[useWebPush] upsert error", upsertErr);
        return false;
      }

      setIsSubscribed(true);
      return true;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return false;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      return true;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
  };
}
