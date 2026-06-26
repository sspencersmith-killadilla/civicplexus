import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { upsertBadgeTemplate, deleteBadgeTemplate } from "@/lib/id-badges.functions";

export const Route = createFileRoute("/_authenticated/id-badge-templates")({
  component: BadgeTemplatesPage,
});

type Tpl = {
  id: string; name: string; org_name: string; accent_color: string; orientation: string;
  show_fields: { title?: boolean; department?: boolean; employee_id?: boolean; qr?: boolean; barcode?: boolean; start_date?: boolean };
  back_text: string | null; is_default: boolean;
};

const DEFAULT_SHOW = { title: true, department: true, employee_id: true, start_date: false, barcode: false, qr: true };

function BadgeTemplatesPage() {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertBadgeTemplate);
  const del = useServerFn(deleteBadgeTemplate);
  const { data: tpls, isLoading } = useQuery({
    queryKey: ["badge-templates"],
    queryFn: async () => (await supabase.from("id_badge_templates").select("*").order("created_at", { ascending: false })).data as Tpl[] | null,
  });
  const [editing, setEditing] = useState<Partial<Tpl> | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const t = editing ?? {};
      await upsert({ data: {
        id: t.id,
        name: t.name ?? "",
        org_name: t.org_name ?? "",
        accent_color: t.accent_color ?? "#0F3460",
        orientation: (t.orientation as "landscape" | "portrait") ?? "landscape",
        show_fields: { ...DEFAULT_SHOW, ...(t.show_fields ?? {}) },
        back_text: t.back_text ?? null,
        is_default: !!t.is_default,
      } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["badge-templates"] }); setEditing(null); toast.success("Template saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await del({ data: { id } }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["badge-templates"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  function toggleShow(key: keyof Tpl["show_fields"], v: boolean) {
    setEditing((p) => ({ ...(p ?? {}), show_fields: { ...DEFAULT_SHOW, ...((p?.show_fields) ?? {}), [key]: v } }));
  }

  return (
    <AppShell title="ID Badge Templates">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-xl">Define how printed CR80 badges look. The default template is used when HR generates a badge without picking one.</p>
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ name: "", org_name: "", accent_color: "#0F3460", orientation: "landscape", show_fields: DEFAULT_SHOW, is_default: !(tpls?.length) })}>
              <Plus className="h-4 w-4 mr-2" /> New template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing?.id ? "Edit template" : "New badge template"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Name</Label><Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Accent color</Label><Input type="color" value={editing?.accent_color ?? "#0F3460"} onChange={(e) => setEditing({ ...editing, accent_color: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Organization name (printed on badge)</Label><Input value={editing?.org_name ?? ""} onChange={(e) => setEditing({ ...editing, org_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                {(["title", "department", "employee_id", "qr", "start_date", "barcode"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-accent">
                    <Checkbox checked={!!editing?.show_fields?.[k]} onCheckedChange={(v) => toggleShow(k, v === true)} />
                    <span className="text-sm capitalize">{k.replace("_", " ")}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-2"><Label>Back text (optional)</Label><Textarea rows={3} value={editing?.back_text ?? ""} onChange={(e) => setEditing({ ...editing, back_text: e.target.value })} /></div>
              <label className="flex items-center gap-2"><Checkbox checked={!!editing?.is_default} onCheckedChange={(v) => setEditing({ ...editing, is_default: v === true })} /><span className="text-sm">Default template</span></label>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate()} disabled={save.isPending || !editing?.name || !editing?.org_name}>{save.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading…</p> : !tpls?.length ? (
        <Card className="p-10 text-center">
          <BadgeCheck className="h-8 w-8 mx-auto text-muted-foreground" />
          <h3 className="mt-3 font-medium">No badge templates yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create one to define how printed badges look.</p>
        </Card>
      ) : (
        <Card className="divide-y">
          {tpls.map((t) => (
            <div key={t.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded" style={{ background: t.accent_color }} />
                <div className="min-w-0">
                  <div className="font-medium">{t.name} {t.is_default && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-secondary">default</span>}</div>
                  <div className="text-sm text-muted-foreground truncate">{t.org_name} · {t.orientation}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)} disabled={remove.isPending}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </AppShell>
  );
}