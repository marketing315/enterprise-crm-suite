import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import { ScrollText, BookOpen, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// eslint-disable-next-line import/no-unresolved
import changelogContent from "../../docs/changelog.md?raw";
// eslint-disable-next-line import/no-unresolved
import runbookContent from "../../docs/admin-runbook.md?raw";
// eslint-disable-next-line import/no-unresolved
import metaBackfillRunbook from "../../docs/meta-leads-backfill-runbook.md?raw";

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
          <TabsTrigger value="changelog">
            <ScrollText className="w-4 h-4 mr-2" />
            Changelog
          </TabsTrigger>
          <TabsTrigger value="runbook">
            <BookOpen className="w-4 h-4 mr-2" />
            Runbook
          </TabsTrigger>
        </TabsList>

        <TabsContent value="changelog">
          <Card>
            <CardHeader>
              <CardTitle>Releases</CardTitle>
            </CardHeader>
            <CardContent>
              <article className="prose prose-sm dark:prose-invert max-w-none">
                <SafeMarkdown>{changelogContent}</SafeMarkdown>
              </article>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runbook">
          <Card>
            <CardHeader>
              <CardTitle>Admin Runbook</CardTitle>
            </CardHeader>
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
