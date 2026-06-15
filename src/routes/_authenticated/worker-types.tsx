import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/worker-types")({
  component: WorkerTypesPage,
});

type WT = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
};

function WorkerTypesPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isHR = hasRole(me?.roles, "hr_admin");

  const { data: items, isLoading } = useQuery({
    queryKey: ["worker_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("worker_types").select("*").order("sort_order");
      if (error) throw error;
      return data as WT[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WT | null>(null);

  const save = useMutation({
    mutationFn: async (form: Partial<WT>) => {
      if (editing) {
        const { error } = await supabase.from("worker_types").update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("worker_types").insert({ ...form, key: (form.key ?? form.name ?? "").toLowerCase().replace(/\s+/g, "_") } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker_types"] });
      toast.success(editing ? "Worker type updated" : "Worker type created");
      setOpen(false);
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("worker_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker_types"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <AppShell title="Worker Types">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-xl">Each worker type drives its own onboarding template, compliance set, and provisioning. Start from the defaults and tailor them for your municipality.</p>
        {isHR && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New worker type</Button></DialogTrigger>
            <WorkerTypeDialog editing={editing} onSubmit={(f) => save.mutate(f)} saving={save.isPending} />
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items?.map((wt) => (
            <Card key={wt.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{wt.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{wt.key}</p>
                </div>
                {!wt.is_active && <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">inactive</span>}
              </div>
              <p className="text-sm text-muted-foreground mt-3 min-h-[2.5rem]">{wt.description}</p>
              {isHR && (
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(wt); setOpen(true); }}><Pencil className="h-3 w-3 mr-1" /> Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete ${wt.name}?`)) remove.mutate(wt.id); }}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function WorkerTypeDialog({ editing, onSubmit, saving }: { editing: WT | null; onSubmit: (f: Partial<WT>) => void; saving: boolean }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(editing?.sort_order ?? 100);

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edit worker type" : "New worker type"}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Field Staff" /></div>
        <div className="space-y-2"><Label>Description</Label><Textarea value={description ?? ""} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Sort order</Label><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label>Active</Label><div className="flex items-center h-9"><Switch checked={isActive} onCheckedChange={setIsActive} /></div></div>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={saving || !name} onClick={() => onSubmit({ name, description, is_active: isActive, sort_order: sortOrder })}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}