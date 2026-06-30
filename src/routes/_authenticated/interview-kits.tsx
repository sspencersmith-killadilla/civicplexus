import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, GripVertical, Video, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { listInterviewKits, upsertInterviewKit, deleteInterviewKit } from "@/lib/interview-kits.functions";

export const Route = createFileRoute("/_authenticated/interview-kits")({ component: KitsPage });

type Question = { id: string; prompt: string; think_seconds: number; max_answer_seconds: number; allow_retake: boolean };
type Rubric = { id: string; label: string; description?: string };
type Kit = {
  id?: string; name: string; kind: "one_way" | "live"; description?: string;
  questions: Question[]; rubric: Rubric[]; default_retention_days: number; ai_assist_default: boolean; is_active: boolean;
};
const EMPTY: Kit = { name: "", kind: "one_way", description: "", questions: [], rubric: [], default_retention_days: 90, ai_assist_default: false, is_active: true };

function KitsPage() {
  const qc = useQueryClient();
  const { data: kits = [] } = useQuery({ queryKey: ["interview-kits"], queryFn: () => listInterviewKits() });
  const [editing, setEditing] = useState<Kit | null>(null);

  const save = useMutation({
    mutationFn: (k: Kit) => upsertInterviewKit({ data: k }),
    onSuccess: () => { toast.success("Saved"); setEditing(null); qc.invalidateQueries({ queryKey: ["interview-kits"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteInterviewKit({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["interview-kits"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Interview Kits</h1>
          <p className="text-sm text-muted-foreground">Reusable question sets and rubrics for one-way (async) and live panel interviews.</p>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4 mr-1" />New kit</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(kits as Kit[]).map((k) => (
          <Card key={k.id} className="p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {k.kind === "one_way" ? <Video className="h-4 w-4" /> : <MessagesSquare className="h-4 w-4" />}
                  {k.name}
                </div>
                <div className="text-xs text-muted-foreground">{k.questions.length} questions · {k.default_retention_days} day retention</div>
              </div>
              <Badge variant={k.is_active ? "default" : "secondary"}>{k.is_active ? "Active" : "Inactive"}</Badge>
            </div>
            {k.description && <p className="text-sm text-muted-foreground">{k.description}</p>}
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setEditing({ ...k })}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this kit?")) del.mutate(k.id!); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
        {kits.length === 0 && <Card className="p-8 text-center text-muted-foreground col-span-2">No kits yet — create one to get started.</Card>}
      </div>

      {editing && <KitEditor kit={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={(k) => save.mutate(k)} saving={save.isPending} />}
    </div>
  );
}

function KitEditor({ kit, onChange, onCancel, onSave, saving }: { kit: Kit; onChange: (k: Kit) => void; onCancel: () => void; onSave: (k: Kit) => void; saving: boolean }) {
  const addQ = () => onChange({ ...kit, questions: [...kit.questions, { id: `q${kit.questions.length + 1}`, prompt: "", think_seconds: 60, max_answer_seconds: 180, allow_retake: true }] });
  const updQ = (i: number, p: Partial<Question>) => onChange({ ...kit, questions: kit.questions.map((q, j) => (j === i ? { ...q, ...p } : q)) });
  const rmQ = (i: number) => onChange({ ...kit, questions: kit.questions.filter((_, j) => j !== i) });
  const addR = () => onChange({ ...kit, rubric: [...kit.rubric, { id: `r${kit.rubric.length + 1}`, label: "" }] });
  const updR = (i: number, p: Partial<Rubric>) => onChange({ ...kit, rubric: kit.rubric.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const rmR = (i: number) => onChange({ ...kit, rubric: kit.rubric.filter((_, j) => j !== i) });

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{kit.id ? "Edit kit" : "New interview kit"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={kit.name} onChange={(e) => onChange({ ...kit, name: e.target.value })} /></div>
            <div><Label>Type</Label>
              <Select value={kit.kind} onValueChange={(v) => onChange({ ...kit, kind: v as Kit["kind"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_way">One-way (async candidate recording)</SelectItem>
                  <SelectItem value="live">Live panel (LiveKit room)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Description</Label><Textarea rows={2} value={kit.description ?? ""} onChange={(e) => onChange({ ...kit, description: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Retention (days)</Label><Input type="number" min={7} max={3650} value={kit.default_retention_days} onChange={(e) => onChange({ ...kit, default_retention_days: parseInt(e.target.value) || 90 })} /></div>
            <div className="flex items-end gap-2"><Switch checked={kit.ai_assist_default} onCheckedChange={(v) => onChange({ ...kit, ai_assist_default: v })} /><Label>AI assist by default</Label></div>
            <div className="flex items-end gap-2"><Switch checked={kit.is_active} onCheckedChange={(v) => onChange({ ...kit, is_active: v })} /><Label>Active</Label></div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2"><Label className="text-base">Questions ({kit.questions.length})</Label><Button size="sm" variant="outline" onClick={addQ}><Plus className="h-4 w-4 mr-1" />Add question</Button></div>
            <div className="space-y-2">
              {kit.questions.map((q, i) => (
                <Card key={i} className="p-3 space-y-2">
                  <div className="flex items-center gap-2"><GripVertical className="h-4 w-4 text-muted-foreground" /><span className="text-xs font-mono text-muted-foreground">{q.id}</span><Button size="sm" variant="ghost" className="ml-auto" onClick={() => rmQ(i)}><Trash2 className="h-4 w-4" /></Button></div>
                  <Textarea placeholder="Question prompt" rows={2} value={q.prompt} onChange={(e) => updQ(i, { prompt: e.target.value })} />
                  {kit.kind === "one_way" && (
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div><Label className="text-xs">Think time (sec)</Label><Input type="number" min={0} max={600} value={q.think_seconds} onChange={(e) => updQ(i, { think_seconds: parseInt(e.target.value) || 0 })} /></div>
                      <div><Label className="text-xs">Max answer (sec)</Label><Input type="number" min={15} max={900} value={q.max_answer_seconds} onChange={(e) => updQ(i, { max_answer_seconds: parseInt(e.target.value) || 60 })} /></div>
                      <div className="flex items-end gap-2"><Switch checked={q.allow_retake} onCheckedChange={(v) => updQ(i, { allow_retake: v })} /><Label className="text-xs">Allow take 2</Label></div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2"><Label className="text-base">Scoring rubric</Label><Button size="sm" variant="outline" onClick={addR}><Plus className="h-4 w-4 mr-1" />Add criterion</Button></div>
            <div className="space-y-2">
              {kit.rubric.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Criterion label" value={r.label} onChange={(e) => updR(i, { label: e.target.value })} />
                  <Input placeholder="Description (optional)" value={r.description ?? ""} onChange={(e) => updR(i, { description: e.target.value })} />
                  <Button size="sm" variant="ghost" onClick={() => rmR(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onSave(kit)} disabled={!kit.name || kit.questions.length === 0 || saving}>{saving ? "Saving…" : "Save kit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}