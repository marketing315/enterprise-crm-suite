import { useEffect, useRef } from "react";
import { useUnreadNotificationCount } from "@/hooks/useNotifications";

/**
 * When the browser tab is in background and there are unread notifications,
 * prefixes document.title with `(N) `. Restores the original on visible/zero.
 *
 * Mount once globally (e.g. in MainLayout).
 */
export function useDocumentTitleBadge() {
  const { data: unread = 0 } = useUnreadNotificationCount();
  const baseTitleRef = useRef<string>(typeof document !== "undefined" ? document.title : "");

  // Capture base title whenever it changes from a non-badged source
  useEffect(() => {
    const current = document.title;
    if (!current.startsWith("(")) {
      baseTitleRef.current = current;
    }
  });

  useEffect(() => {
    const apply = () => {
      const base = baseTitleRef.current.replace(/^\(\d+\)\s*/, "");
      const hidden = document.visibilityState === "hidden";
      if (hidden && unread > 0) {
        const n = unread > 99 ? "99+" : String(unread);
        document.title = `(${n}) ${base}`;
      } else {
        document.title = base;
      }
    };

    apply();
    document.addEventListener("visibilitychange", apply);
    return () => {
      document.removeEventListener("visibilitychange", apply);
      // Always restore on unmount
      document.title = baseTitleRef.current.replace(/^\(\d+\)\s*/, "");
    };
  }, [unread]);
}
