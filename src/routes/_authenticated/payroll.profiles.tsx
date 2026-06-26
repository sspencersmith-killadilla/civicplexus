import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, FileOutput } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

type Profile = {
  id: string;
  name: string;
  bureau: string;
  file_format: string;
  column_map: Record<string, string>;
  earnings_codes: unknown;
  deduction_codes: unknown;
  is_active: boolean;
  notes: string | null;
};

export const Route = createFileRoute("/_authenticated/payroll/profiles")({ component: PayrollProfilesPage });

function PayrollProfilesPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isHr = hasRole(me?.roles, "hr_admin");

  const profilesQ = useQuery({
    queryKey: ["payroll-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_export_profiles").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState({
    name: "",
    bureau: "",
    file_format: "csv",
    column_map: "",
    notes: "",
  });

  const save = useMutation({
    mutationFn: async () => {
      let colMap: Record<string, string> = {};
      try {
        colMap = form.column_map ? JSON.parse(form.column_map) : {};
      } catch {
        throw new Error("Column map must be valid JSON");
      }
      const payload = {
        name: form.name,
        bureau: form.bureau,
        file_format: form.file_format,
        column_map: colMap,
        earnings_codes: {},
        deduction_codes: {},
        is_active: true,
        notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase.from("payroll_export_profiles").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_export_profiles").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Profile updated" : "Profile created");
      setOpen(false);
      setEditing(null);
      setForm({ name: "", bureau: "", file_format: "csv", column_map: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["payroll-profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll_export_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["payroll-profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Payroll Export Profiles">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Export profiles map your internal payroll fields to the column names and formats your payroll bureau expects.
        </p>
        {isHr && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm({ name: "", bureau: "", file_format: "csv", column_map: "", notes: "" }); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New profile</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Edit profile" : "New export profile"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Munis General Fund" /></div>
                <div><Label>Bureau / System</Label><Input value={form.bureau} onChange={(e) => setForm({ ...form, bureau: e.target.value })} placeholder="Munis, Tyler, SAP…" /></div>
                <div>
                  <Label>File format</Label>
                  <Select value={form.file_format} onValueChange={(v) => setForm({ ...form, file_format: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="fixed_width">Fixed-width</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Column map (JSON)</Label>
                  <Textarea
                    value={form.column_map}
                    onChange={(e) => setForm({ ...form, column_map: e.target.value })}
                    placeholder={`{\n  "employee_id": "EmpID",\n  "reg_hours": "REG_HOURS",\n  "gross": "GROSS_PAY"\n}`}
                    rows={5}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Map internal field names to the bureau’s expected column headers.</p>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!form.name || !form.bureau || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Bureau</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Active</TableHead>
              {isHr && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(profilesQ.data ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.bureau}</TableCell>
                <TableCell className="uppercase text-xs">{p.file_format}</TableCell>
                <TableCell>{p.is_active ? "Yes" : "No"}</TableCell>
                {isHr && (
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditing(p);
                      setForm({
                        name: p.name,
                        bureau: p.bureau,
                        file_format: p.file_format,
                        column_map: JSON.stringify(p.column_map ?? {}, null, 2),
                        notes: p.notes ?? "",
                      });
                      setOpen(true);
                    }}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete ${p.name}?`)) remove.mutate(p.id); }}><Trash2 className="h-3 w-3" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {(profilesQ.data?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={isHr ? 5 : 4} className="text-center text-muted-foreground py-6">No profiles yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
