import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import { ScrollText, BookOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// eslint-disable-next-line import/no-unresolved
import changelogContent from "../../docs/changelog.md?raw";
// eslint-disable-next-line import/no-unresolved
import runbookContent from "../../docs/admin-runbook.md?raw";

/**
 * Sprint 8: rendering in-app del changelog e del runbook admin.
 * I markdown sono bundlati a build time con `?raw` (no fetch runtime).
 */
export default function AdminChangelog() {
  return (
    <div className="container mx-auto py-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ScrollText className="w-7 h-7 text-primary" />
          Release Changelog & Runbook
        </h1>
        <p className="text-muted-foreground">
          Storico ufficiale dei rilasci e procedure operative admin.
        </p>
      </div>

      <Tabs defaultValue="changelog" className="space-y-4">
        <TabsList>
          <TabsTrigger value="changelog"><ScrollText className="w-4 h-4 mr-2" />Changelog</TabsTrigger>
          <TabsTrigger value="runbook"><BookOpen className="w-4 h-4 mr-2" />Runbook</TabsTrigger>
        </TabsList>

        <TabsContent value="changelog">
          <Card>
            <CardHeader><CardTitle>Releases</CardTitle></CardHeader>
            <CardContent>
              <article className="prose prose-sm dark:prose-invert max-w-none">
                <SafeMarkdown>{changelogContent}</SafeMarkdown>
              </article>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runbook">
          <Card>
            <CardHeader><CardTitle>Admin Runbook</CardTitle></CardHeader>
            <CardContent>
              <article className="prose prose-sm dark:prose-invert max-w-none">
                <SafeMarkdown>{runbookContent}</SafeMarkdown>
              </article>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

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
