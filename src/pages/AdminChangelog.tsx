import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText, AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Sprint 8: rendering in-app del docs/changelog.md per avere una "release notes"
 * accessibile da tutti gli admin senza dover aprire il repo.
 *
 * I file sotto /docs sono serviti come asset statico in dev (Vite serve il
 * project root). In prod sono inclusi nel bundle solo se referenziati: per
 * sicurezza facciamo fetch via URL pubblico e fallback a errore graceful.
 */
export default function AdminChangelog() {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/docs/changelog.md", { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!cancelled) setContent(text);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ScrollText className="w-7 h-7 text-primary" />
          Release Changelog
        </h1>
        <p className="text-muted-foreground">
          Storico ufficiale dei rilasci in produzione (fonte: <code>docs/changelog.md</code>).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Releases</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <EmptyState
              icon={AlertCircle}
              title="Changelog non disponibile"
              description={`Impossibile caricare il file (${error}). Controlla che docs/changelog.md sia servito staticamente.`}
            />
          ) : content === null ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-6 w-1/4 mt-6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : (
            <article className="prose prose-sm dark:prose-invert max-w-none">
              <SafeMarkdown>{content}</SafeMarkdown>
            </article>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
