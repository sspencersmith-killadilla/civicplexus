import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download } from "lucide-react";
import userGuide from "@/../docs/USER_GUIDE.md?raw";
import selfHostGuide from "@/../docs/SELF_HOSTING_GUIDE.md?raw";
import endUserGuide from "@/../docs/END_USER_GUIDE.md?raw";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({ meta: [{ title: "Help & Docs — CivicPlexus" }] }),
  component: HelpPage,
});

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function HelpPage() {
  const [tab, setTab] = useState("enduser");
  const activeContent =
    tab === "user" ? userGuide : tab === "host" ? selfHostGuide : endUserGuide;
  const activeFilename =
    tab === "user"
      ? "civicplexus-user-guide.md"
      : tab === "host"
        ? "civicplexus-self-hosting-guide.md"
        : "civicplexus-end-user-guide.md";
  return (
    <AppShell title="Help & Docs">
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="enduser">End User Guide</TabsTrigger>
            <TabsTrigger value="user">User Guide</TabsTrigger>
            <TabsTrigger value="host">Self-Hosting Guide</TabsTrigger>
          </TabsList>
          <Button
            variant="outline" size="sm"
            onClick={() => download(activeFilename, activeContent)}
          >
            <Download className="h-4 w-4 mr-2" /> Download Markdown
          </Button>
        </div>
        <TabsContent value="enduser">
          <Card className="p-6 md:p-10">
            <article className="prose prose-sm md:prose-base max-w-none dark:prose-invert prose-headings:font-serif prose-table:text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{endUserGuide}</ReactMarkdown>
            </article>
          </Card>
        </TabsContent>
        <TabsContent value="user">
          <Card className="p-6 md:p-10">
            <article className="prose prose-sm md:prose-base max-w-none dark:prose-invert prose-headings:font-serif prose-table:text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{userGuide}</ReactMarkdown>
            </article>
          </Card>
        </TabsContent>
        <TabsContent value="host">
          <Card className="p-6 md:p-10">
            <article className="prose prose-sm md:prose-base max-w-none dark:prose-invert prose-headings:font-serif prose-table:text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selfHostGuide}</ReactMarkdown>
            </article>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
