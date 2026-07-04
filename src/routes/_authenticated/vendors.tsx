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
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vendors")({
  component: VendorsPage,
});

type Vendor = {
  id: string;
  legal_name: string;
  dba: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tax_id: string | null;
  status: string;
  contract_value: number | null;
  contract_start: string | null;
  contract_end: string | null;
  coi_expires_at: string | null;
  insurance_verified: boolean;
  notes: string | null;
};
type Assignment = { id: string; vendor_id: string; project_name: string; role: string | null; start_date: string | null; end_date: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function VendorsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [assignFor, setAssignFor] = useState<Vendor | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await sb.from("vendors").select("*").order("legal_name");
      if (error) throw error;
      return data as Vendor[];
    },
  });

  const save = useMutation({
    mutationFn: async (form: Partial<Vendor>) => {
      if (editing) {
        const { error } = await sb.from("vendors").update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("vendors").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      toast.success(editing ? "Updated" : "Added");
      setOpen(false); setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const now = Date.now();
  const daysUntil = (d?: string | null) => d ? Math.floor((new Date(d).getTime() - now) / 86400000) : null;

  const expiringSoon = (items ?? []).filter((v) => {
    const d = daysUntil(v.coi_expires_at);
    return d !== null && d <= 30;
  });

  return (
    <AppShell title="Vendors & Contractors">
      <div className="flex items-center justify-between mb-6 gap-4">
        <p className="text-muted-foreground text-sm max-w-2xl">
          Vendor directory with insurance (COI) tracking, contract windows, and project assignments.
          Public intake at <code>/serve/vendor</code>.
        </p>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New vendor</Button></DialogTrigger>
          <VendorDialog key={editing?.id ?? "new"} editing={editing} onSubmit={(f) => save.mutate(f)} saving={save.isPending} />
        </Dialog>
      </div>

      {expiringSoon.length > 0 && (
        <Card className="p-4 mb-4 border-amber-300 bg-amber-50/50">
          <div className="flex items-center gap-2 text-amber-700 font-medium text-sm mb-2">
            <AlertTriangle className="h-4 w-4" /> Insurance expiring within 30 days
          </div>
          <ul className="text-sm space-y-1">
            {expiringSoon.map((v) => (
              <li key={v.id}>{v.legal_name} — expires {v.coi_expires_at}</li>
            ))}
          </ul>
        </Card>
      )}

      {isLoading ? <p className="text-muted-foreground">Loading…</p> : (items?.length ?? 0) === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No vendors yet.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items!.map((v) => {
            const d = daysUntil(v.coi_expires_at);
            return (
              <Card key={v.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{v.legal_name}</h3>
                    {v.dba && <p className="text-xs text-muted-foreground">dba {v.dba}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{v.contact_name ?? "—"} · {v.contact_email ?? "—"}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <Badge variant="outline">{v.status}</Badge>
                    {v.insurance_verified && <div className="text-[10px] text-emerald-700 flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> COI verified</div>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div><span className="text-muted-foreground">Contract:</span> {v.contract_start ?? "—"} → {v.contract_end ?? "—"}</div>
                  <div><span className="text-muted-foreground">Value:</span> {v.contract_value != null ? `$${Number(v.contract_value).toLocaleString()}` : "—"}</div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">COI expires:</span> {v.coi_expires_at ?? "—"}
                    {d !== null && d <= 30 && <span className="ml-2 text-amber-700">({d} days)</span>}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(v); setOpen(true); }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAssignFor(v)}>Assignments</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AssignmentsDialog vendor={assignFor} onClose={() => setAssignFor(null)} />
    </AppShell>
  );
}

function VendorDialog({
  editing, onSubmit, saving,
}: { editing: Vendor | null; onSubmit: (f: Partial<Vendor>) => void; saving: boolean }) {
  const [legal, setLegal] = useState(editing?.legal_name ?? "");
  const [dba, setDba] = useState(editing?.dba ?? "");
  const [cName, setCName] = useState(editing?.contact_name ?? "");
  const [cEmail, setCEmail] = useState(editing?.contact_email ?? "");
  const [cPhone, setCPhone] = useState(editing?.contact_phone ?? "");
  const [status, setStatus] = useState(editing?.status ?? "active");
  const [value, setValue] = useState(editing?.contract_value?.toString() ?? "");
  const [start, setStart] = useState(editing?.contract_start ?? "");
  const [end, setEnd] = useState(editing?.contract_end ?? "");
  const [coi, setCoi] = useState(editing?.coi_expires_at ?? "");
  const [verified, setVerified] = useState(editing?.insurance_verified ?? false);
  const [notes, setNotes] = useState(editing?.notes ?? "");

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Edit vendor" : "New vendor"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Legal name</Label><Input value={legal} onChange={(e) => setLegal(e.target.value)} /></div>
          <div><Label>DBA</Label><Input value={dba ?? ""} onChange={(e) => setDba(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Contact name</Label><Input value={cName ?? ""} onChange={(e) => setCName(e.target.value)} /></div>
          <div><Label>Email</Label><Input value={cEmail ?? ""} onChange={(e) => setCEmail(e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={cPhone ?? ""} onChange={(e) => setCPhone(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Contract value ($)</Label><Input type="number" value={value} onChange={(e) => setValue(e.target.value)} /></div>
          <div><Label>COI expires</Label><Input type="date" value={coi ?? ""} onChange={(e) => setCoi(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Contract start</Label><Input type="date" value={start ?? ""} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>Contract end</Label><Input type="date" value={end ?? ""} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <div className="flex items-center gap-2">
          <input id="ver" type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
          <Label htmlFor="ver" className="text-sm">Insurance verified</Label>
        </div>
        <div><Label>Notes</Label><Textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
      </div>
      <DialogFooter>
        <Button
          disabled={saving || !legal}
          onClick={() => onSubmit({
            legal_name: legal,
            dba: dba || null,
            contact_name: cName || null,
            contact_email: cEmail || null,
            contact_phone: cPhone || null,
            status,
            contract_value: value ? Number(value) : null,
            contract_start: start || null,
            contract_end: end || null,
            coi_expires_at: coi || null,
            insurance_verified: verified,
            notes: notes || null,
          })}
        >{saving ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AssignmentsDialog({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [project, setProject] = useState("");
  const [role, setRole] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const { data: list } = useQuery({
    queryKey: ["vendor_assignments", vendor?.id],
    enabled: !!vendor,
    queryFn: async () => {
      const { data, error } = await sb.from("vendor_assignments").select("*")
        .eq("vendor_id", vendor!.id).order("start_date", { ascending: false });
      if (error) throw error;
      return data as Assignment[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("vendor_assignments").insert({
        vendor_id: vendor!.id, project_name: project, role: role || null,
        start_date: start || null, end_date: end || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor_assignments", vendor?.id] });
      setProject(""); setRole(""); setStart(""); setEnd("");
      toast.success("Assignment added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={!!vendor} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assignments — {vendor?.legal_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2"><Label>Project</Label><Input value={project} onChange={(e) => setProject(e.target.value)} /></div>
            <div><Label>Role</Label><Input value={role} onChange={(e) => setRole(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2 col-span-2 sm:col-span-1">
              <div><Label className="text-xs">Start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div><Label className="text-xs">End</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
          </div>
          <Button size="sm" disabled={!project || add.isPending} onClick={() => add.mutate()}>Add assignment</Button>
          <div className="border-t pt-3 max-h-56 overflow-y-auto text-sm">
            {(list ?? []).map((r) => (
              <div key={r.id} className="py-1 border-b last:border-0">
                <div className="font-medium">{r.project_name}</div>
                <div className="text-xs text-muted-foreground">{r.role ?? "—"} · {r.start_date ?? "—"} → {r.end_date ?? "—"}</div>
              </div>
            ))}
            {(list ?? []).length === 0 && <p className="text-muted-foreground text-xs">No assignments yet.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}