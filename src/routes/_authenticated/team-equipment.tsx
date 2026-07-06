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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Users } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/team-equipment")({ component: TeamEquipmentPage });

const STATUS_STYLES: Record<string, string> = {
  requested: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  picked: "bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
  issued: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  returned: "bg-muted text-muted-foreground",
};

function TeamEquipmentPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const managerEmployeeId = me?.employee_id ?? null;

  const { data: reports } = useQuery({
    enabled: !!managerEmployeeId,
    queryKey: ["team-eq-reports", managerEmployeeId],
    queryFn: async () =>
      (
        await supabase
          .from("employees")
          .select("id, first_name, last_name")
          .eq("manager_id", managerEmployeeId!)
          .eq("status", "active")
          .order("last_name")
      ).data ?? [],
  });

  const reportIds = (reports ?? []).map((r) => r.id);

  const { data: catalog } = useQuery({
    queryKey: ["team-eq-catalog"],
    queryFn: async () => (await supabase.from("equipment_catalog").select("id, name, category").order("name")).data ?? [],
  });

  const { data: items } = useQuery({
    enabled: reportIds.length > 0,
    queryKey: ["team-eq-issuance", reportIds.join(",")],
    queryFn: async () =>
      (
        await supabase
          .from("equipment_issuance")
          .select("*, equipment_catalog(name, category), employees(first_name, last_name)")
          .in("employee_id", reportIds)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", item_id: "", size: "", quantity: "1", notes: "" });
  const request = useMutation({
    mutationFn: async () => {
      if (!form.employee_id) throw new Error("Choose an employee.");
      if (!form.item_id) throw new Error("Choose an item.");
      const { error } = await supabase.from("equipment_issuance").insert({
        employee_id: form.employee_id,
        item_id: form.item_id,
        size: form.size || null,
        quantity: Number(form.quantity) || 1,
        notes: form.notes || null,
        status: "requested",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request submitted");
      setOpen(false);
      setForm({ employee_id: "", item_id: "", size: "", quantity: "1", notes: "" });
      qc.invalidateQueries({ queryKey: ["team-eq-issuance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Team Equipment & PPE">
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!reports?.length}><Users className="h-4 w-4 mr-2" /> Request for a report</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request equipment for a direct report</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Employee</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(reports ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.last_name}, {r.first_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Item</Label>
                <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select an item…" /></SelectTrigger>
                  <SelectContent>
                    {(catalog ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} · {c.category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Size</Label><Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="M, 10.5, N/A" /></div>
                <div><Label>Quantity</Label><Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
              </div>
              <div>
                <Label>Reason / notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!form.employee_id || !form.item_id || request.isPending} onClick={() => request.mutate()}>
                {request.isPending ? "Submitting…" : "Submit request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!reports?.length && (
        <Card className="p-10 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
          You don't have any active direct reports on file.
        </Card>
      )}

      {!!reports?.length && !items?.length && (
        <Card className="p-10 text-center text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No equipment or PPE on file for your team yet.
        </Card>
      )}

      {!!items?.length && (
        <Card className="divide-y">
          {items.map((i) => {
            const cat = i.equipment_catalog as { name: string; category: string } | null;
            const emp = i.employees as { first_name: string; last_name: string } | null;
            return (
              <div key={i.id} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{cat?.name ?? "Item"}</p>
                  <p className="text-xs text-muted-foreground">
                    {emp ? `${emp.first_name} ${emp.last_name}` : ""}
                    {cat?.category ? ` · ${cat.category}` : ""}
                    {i.size ? ` · Size ${i.size}` : ""}
                    {i.quantity && i.quantity > 1 ? ` · Qty ${i.quantity}` : ""}
                  </p>
                  {i.notes && <p className="text-xs mt-1">{i.notes}</p>}
                </div>
                <Badge className={STATUS_STYLES[i.status] ?? ""} variant="secondary">{i.status}</Badge>
              </div>
            );
          })}
        </Card>
      )}
    </AppShell>
  );
}