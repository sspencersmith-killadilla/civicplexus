import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Sparkles, Printer, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/docs-generator")({
  head: () => ({ meta: [{ title: "Docs Generator — Noöpolis" }] }),
  component: DocsGeneratorPage,
});

// Minimal, dependency-free markdown → HTML for policy bodies. Handles headings,
// lists, bold/italic, paragraphs. Anything more complex falls back to escaped text.
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList: "ul" | "ol" | null = null;
  const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { closeList(); out.push(`<h${h[1].length}>${esc(h[2])}</h${h[1].length}>`); continue; }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) { if (inList !== "ul") { closeList(); out.push("<ul>"); inList = "ul"; } out.push(`<li>${inline(ul[1])}</li>`); continue; }
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ol) { if (inList !== "ol") { closeList(); out.push("<ol>"); inList = "ol"; } out.push(`<li>${inline(ol[1])}</li>`); continue; }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("\n");
  function inline(s: string) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }
}

type Toggle = Record<string, boolean>;

function DocsGeneratorPage() {
  const { data: workerTypes } = useQuery({ queryKey: ["wt-all"], queryFn: async () => (await supabase.from("worker_types").select("id,key,name").eq("is_active", true).order("sort_order")).data ?? [] });
  const { data: policies } = useQuery({ queryKey: ["policies-pub"], queryFn: async () => (await supabase.from("policies").select("id,title,body_md,version,effective_date,published").eq("published", true).order("title")).data ?? [] });
  const { data: forms } = useQuery({ queryKey: ["forms-active"], queryFn: async () => (await supabase.from("form_definitions").select("id,key,title,description,jurisdiction,version,requires_signature").eq("is_active", true).order("title")).data ?? [] });
  const { data: courses } = useQuery({ queryKey: ["courses-active"], queryFn: async () => (await supabase.from("courses").select("id,name,description,duration_minutes,compliance_framework,required_for_worker_types").eq("active", true).order("name")).data ?? [] });
  const { data: org } = useQuery({ queryKey: ["org-name"], queryFn: async () => (await supabase.from("org_settings").select("org_name").maybeSingle()).data });

  const [packetTitle, setPacketTitle] = useState("New Hire Onboarding Packet");
  const [workerTypeId, setWorkerTypeId] = useState<string>("");
  const [selPolicies, setSelPolicies] = useState<Toggle>({});
  const [selForms, setSelForms] = useState<Toggle>({});
  const [selCourses, setSelCourses] = useState<Toggle>({});

  const wt = workerTypes?.find((w) => w.id === workerTypeId);

  const recommended = useMemo(() => {
    if (!wt) return { courseIds: new Set<string>() };
    const courseIds = new Set<string>();
    for (const c of courses ?? []) {
      if ((c.required_for_worker_types ?? []).includes(wt.key)) courseIds.add(c.id);
    }
    return { courseIds };
  }, [wt, courses]);

  function applyRecommended() {
    const next: Toggle = { ...selCourses };
    recommended.courseIds.forEach((id) => { next[id] = true; });
    setSelCourses(next);
    // Auto-select every published policy + every active form as a sensible default packet.
    setSelPolicies(Object.fromEntries((policies ?? []).map((p) => [p.id, true])));
    setSelForms(Object.fromEntries((forms ?? []).map((f) => [f.id, true])));
    toast.success("Recommended items selected");
  }

  function selectedCount(t: Toggle) { return Object.values(t).filter(Boolean).length; }

  function buildPacket() {
    const chosenPolicies = (policies ?? []).filter((p) => selPolicies[p.id]);
    const chosenForms = (forms ?? []).filter((f) => selForms[f.id]);
    const chosenCourses = (courses ?? []).filter((c) => selCourses[c.id]);
    if (!chosenPolicies.length && !chosenForms.length && !chosenCourses.length) {
      toast.error("Select at least one document to include");
      return null;
    }
    return { chosenPolicies, chosenForms, chosenCourses };
  }

  function buildMarkdown(): string | null {
    const p = buildPacket();
    if (!p) return null;
    const orgName = org?.org_name ?? "Noöpolis";
    const today = new Date().toISOString().slice(0, 10);
    const lines: string[] = [];
    lines.push(`# ${packetTitle}`, "", `**Organization:** ${orgName}`, `**Generated:** ${today}`, wt ? `**Worker type:** ${wt.name}` : "", "", "---", "");
    lines.push("## Contents", "");
    let i = 1;
    if (p.chosenForms.length) { lines.push(`${i++}. Required forms (${p.chosenForms.length})`); }
    if (p.chosenPolicies.length) { lines.push(`${i++}. Policies to acknowledge (${p.chosenPolicies.length})`); }
    if (p.chosenCourses.length) { lines.push(`${i++}. Training & certifications (${p.chosenCourses.length})`); }
    lines.push("", "---", "");
    if (p.chosenForms.length) {
      lines.push("## Required forms", "");
      for (const f of p.chosenForms) {
        lines.push(`### ${f.title} _(v${f.version})_`);
        if (f.jurisdiction) lines.push(`*Jurisdiction:* ${f.jurisdiction}`);
        if (f.description) lines.push("", f.description);
        if (f.requires_signature) lines.push("", "_Signature required._");
        lines.push("");
      }
      lines.push("---", "");
    }
    if (p.chosenPolicies.length) {
      lines.push("## Policies", "");
      for (const pol of p.chosenPolicies) {
        lines.push(`### ${pol.title} _(v${pol.version}, effective ${pol.effective_date})_`, "", pol.body_md ?? "", "", "**Acknowledgment**", "", "I have read and agree to the policy above.", "", "Signature: ____________________________   Date: ______________", "");
      }
      lines.push("---", "");
    }
    if (p.chosenCourses.length) {
      lines.push("## Training & certifications", "");
      for (const c of p.chosenCourses) {
        lines.push(`### ${c.name}`);
        if (c.compliance_framework) lines.push(`*Framework:* ${c.compliance_framework}`);
        if (c.duration_minutes) lines.push(`*Duration:* ${c.duration_minutes} minutes`);
        if (c.description) lines.push("", c.description);
        lines.push("");
      }
    }
    return lines.filter((l) => l !== "").join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function downloadMd() {
    const md = buildMarkdown();
    if (!md) return;
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${packetTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`; a.click();
  }

  function openPrintable() {
    const md = buildMarkdown();
    if (!md) return;
    const html = mdToHtml(md);
    const orgName = org?.org_name ?? "Noöpolis";
    const win = window.open("", "_blank");
    if (!win) { toast.error("Allow popups to preview the packet"); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${packetTitle}</title><style>
      body { font-family: Georgia, serif; max-width: 7.5in; margin: 0.75in auto; color: #111; line-height: 1.5; }
      h1 { font-size: 28pt; border-bottom: 2px solid #333; padding-bottom: 8px; }
      h2 { font-size: 18pt; margin-top: 1.5em; border-bottom: 1px solid #ccc; padding-bottom: 4px; page-break-before: always; }
      h2:first-of-type { page-break-before: auto; }
      h3 { font-size: 13pt; margin-top: 1.2em; }
      p, li { font-size: 11pt; }
      em { color: #555; }
      code { background: #f4f4f4; padding: 1px 4px; border-radius: 3px; }
      footer { margin-top: 2em; font-size: 9pt; color: #666; text-align: center; }
      @media print { h2 { page-break-before: always; } }
    </style></head><body>${html}<footer>${orgName} — generated ${new Date().toLocaleString()}</footer><script>setTimeout(()=>window.print(), 300);</script></body></html>`);
    win.document.close();
  }

  return (
    <AppShell title="Docs Generator">
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">Assemble a tailored onboarding packet from your published policies, active forms, and training. Pick a worker type to pre-select what each role typically needs, adjust, then export.</p>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <Card className="p-4 space-y-4 h-fit">
          <div>
            <Label>Packet title</Label>
            <Input value={packetTitle} onChange={(e) => setPacketTitle(e.target.value)} />
          </div>
          <div>
            <Label>Worker type (optional)</Label>
            <Select value={workerTypeId} onValueChange={setWorkerTypeId}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                {workerTypes?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="w-full" onClick={applyRecommended}><Sparkles className="h-4 w-4 mr-2" /> Auto-select recommended</Button>
          <div className="pt-2 border-t space-y-2 text-sm">
            <div className="flex justify-between"><span>Forms</span><Badge variant="secondary">{selectedCount(selForms)}</Badge></div>
            <div className="flex justify-between"><span>Policies</span><Badge variant="secondary">{selectedCount(selPolicies)}</Badge></div>
            <div className="flex justify-between"><span>Courses</span><Badge variant="secondary">{selectedCount(selCourses)}</Badge></div>
          </div>
          <div className="pt-2 border-t flex flex-col gap-2">
            <Button onClick={openPrintable}><Printer className="h-4 w-4 mr-2" /> Preview & Print PDF</Button>
            <Button variant="outline" onClick={downloadMd}><Download className="h-4 w-4 mr-2" /> Download Markdown</Button>
          </div>
        </Card>

        <div className="space-y-6 min-w-0">
          <SelectorSection
            title="Required forms"
            empty="No active forms. Add them in Forms Library."
            items={(forms ?? []).map((f) => ({ id: f.id, primary: f.title, secondary: [f.jurisdiction, `v${f.version}`, f.requires_signature ? "Signature required" : null].filter(Boolean).join(" · ") }))}
            selected={selForms}
            onToggle={(id, v) => setSelForms({ ...selForms, [id]: v })}
          />
          <SelectorSection
            title="Policies"
            empty="No published policies."
            items={(policies ?? []).map((p) => ({ id: p.id, primary: p.title, secondary: `v${p.version} · effective ${p.effective_date}` }))}
            selected={selPolicies}
            onToggle={(id, v) => setSelPolicies({ ...selPolicies, [id]: v })}
          />
          <SelectorSection
            title="Training & certifications"
            empty="No active courses."
            items={(courses ?? []).map((c) => ({
              id: c.id,
              primary: c.name,
              secondary: [c.compliance_framework, c.duration_minutes ? `${c.duration_minutes} min` : null].filter(Boolean).join(" · "),
              hint: wt && (c.required_for_worker_types ?? []).includes(wt.key) ? "Recommended" : null,
            }))}
            selected={selCourses}
            onToggle={(id, v) => setSelCourses({ ...selCourses, [id]: v })}
          />
        </div>
      </div>
    </AppShell>
  );
}

function SelectorSection({ title, empty, items, selected, onToggle }: {
  title: string;
  empty: string;
  items: Array<{ id: string; primary: string; secondary?: string; hint?: string | null }>;
  selected: Toggle;
  onToggle: (id: string, v: boolean) => void;
}) {
  return (
    <Card>
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="font-medium flex items-center gap-2"><FileText className="h-4 w-4" /> {title}</h2>
        <span className="text-xs text-muted-foreground">{items.length} available</span>
      </div>
      {!items.length ? (
        <div className="p-6 text-sm text-muted-foreground text-center">{empty}</div>
      ) : (
        <ul className="divide-y">
          {items.map((it) => (
            <li key={it.id} className="flex items-start gap-3 p-3">
              <Checkbox checked={!!selected[it.id]} onCheckedChange={(v) => onToggle(it.id, !!v)} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{it.primary}</p>
                {it.secondary && <p className="text-xs text-muted-foreground">{it.secondary}</p>}
              </div>
              {it.hint && <Badge variant="outline" className="text-xs">{it.hint}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}