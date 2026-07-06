import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Package, UserPlus, Undo2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/equipment")({ component: EquipmentPage });

const STAGES = ["requested", "picked", "issued", "returned"] as const;

function EquipmentPage() {
  const qc = useQueryClient();
  const { data: catalog } = useQuery({ queryKey: ["catalog"], queryFn: async () => (await supabase.from("equipment_catalog").select("*").order("name")).data ?? [] });
  const { data: issuance } = useQuery({ queryKey: ["issuance"], queryFn: async () => (await supabase.from("equipment_issuance").select("*, equipment_catalog(name), employees(first_name,last_name)").order("created_at", { ascending: false })).data ?? [] });
  const { data: employees } = useQuery({
    queryKey: ["equipment-employees"],
    queryFn: async () => (await supabase.from("employees").select("id, first_name, last_name").eq("status", "active").order("last_name")).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sku: "", name: "", category: "uniform", unit_cost: "" });
  const createItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("equipment_catalog").insert({ sku: form.sku, name: form.name, category: form.category, unit_cost: form.unit_cost ? Number(form.unit_cost) : null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item added"); setOpen(false); setForm({ sku: "", name: "", category: "uniform", unit_cost: "" }); qc.invalidateQueries({ queryKey: ["catalog"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveStage = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: { status: string; issued_at?: string; returned_at?: string } = { status };
      if (status === "issued") patch.issued_at = new Date().toISOString();
      if (status === "returned") patch.returned_at = new Date().toISOString();
      const { error } = await supabase.from("equipment_issuance").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issuance"] }),
  });

  const [assignOpen, setAssignOpen] = useState(false);
  const [assign, setAssign] = useState({ employee_id: "", item_id: "", size: "", quantity: "1", expected_return_at: "", notes: "" });
  const createAssignment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("equipment_issuance").insert({
        employee_id: assign.employee_id,
        item_id: assign.item_id,
        size: assign.size || null,
        quantity: Number(assign.quantity) || 1,
        expected_return_at: assign.expected_return_at || null,
        notes: assign.notes || null,
        status: "issued",
        issued_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assigned");
      setAssignOpen(false);
      setAssign({ employee_id: "", item_id: "", size: "", quantity: "1", expected_return_at: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["issuance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isOverdue = (i: { status: string; expected_return_at: string | null }) =>
    i.status !== "returned" && !!i.expected_return_at && new Date(i.expected_return_at) < new Date();

  return (
    <AppShell title="Equipment & PPE">
      <Tabs defaultValue="issuance">
        <TabsList>
          <TabsTrigger value="issuance">Issuance</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
        </TabsList>
        <TabsContent value="issuance" className="mt-6">
          <div className="flex justify-end mb-4">
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
              <DialogTrigger asChild><Button><UserPlus className="h-4 w-4 mr-2" /> Assign equipment</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign equipment to an employee</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Employee</Label>
                    <Select value={assign.employee_id} onValueChange={(v) => setAssign({ ...assign, employee_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.last_name}, {e.first_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Item</Label>
                    <Select value={assign.item_id} onValueChange={(v) => setAssign({ ...assign, item_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {(catalog ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.category}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Size</Label><Input value={assign.size} onChange={(e) => setAssign({ ...assign, size: e.target.value })} placeholder="M, 10.5, N/A" /></div>
                    <div><Label>Quantity</Label><Input type="number" min="1" value={assign.quantity} onChange={(e) => setAssign({ ...assign, quantity: e.target.value })} /></div>
                  </div>
                  <div><Label>Expected return</Label><Input type="date" value={assign.expected_return_at} onChange={(e) => setAssign({ ...assign, expected_return_at: e.target.value })} /></div>
                  <div><Label>Notes</Label><Input value={assign.notes} onChange={(e) => setAssign({ ...assign, notes: e.target.value })} /></div>
                </div>
                <DialogFooter>
                  <Button disabled={!assign.employee_id || !assign.item_id || createAssignment.isPending} onClick={() => createAssignment.mutate()}>
                    {createAssignment.isPending ? "Assigning…" : "Assign"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {STAGES.map((s) => (
              <div key={s}>
                <h3 className="font-medium capitalize mb-3">{s}</h3>
                <div className="space-y-2">
                  {issuance?.filter((i) => i.status === s).map((i) => {
                    const idx = STAGES.indexOf(s);
                    const overdue = isOverdue(i as { status: string; expected_return_at: string | null });
                    return (
                      <Card key={i.id} className={"p-3 " + (overdue ? "border-destructive/50" : "")}>
                        <p className="font-medium text-sm">{(i.equipment_catalog as { name: string } | null)?.name}</p>
                        <p className="text-xs text-muted-foreground">{(i.employees as { first_name: string; last_name: string } | null)?.first_name} {(i.employees as { first_name: string; last_name: string } | null)?.last_name}</p>
                        {i.size && <p className="text-xs">Size: {i.size}</p>}
                        {i.expected_return_at && (
                          <p className={"text-xs " + (overdue ? "text-destructive" : "text-muted-foreground")}>
                            {overdue ? "Overdue since " : "Due "} {new Date(i.expected_return_at).toLocaleDateString()}
                          </p>
                        )}
                        {idx < STAGES.length - 1 && (
                          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => moveStage.mutate({ id: i.id, status: STAGES[idx + 1] })}>
                            → {STAGES[idx + 1]}
                          </Button>
                        )}
                        {s === "issued" && (
                          <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => moveStage.mutate({ id: i.id, status: "returned" })}>
                            <Undo2 className="h-3 w-3 mr-1" /> Mark returned
                          </Button>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="catalog" className="mt-6">
          <div className="flex justify-end mb-4">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Item</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Catalog Item</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
                  <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
                  <div><Label>Unit Cost</Label><Input type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /></div>
                </div>
                <DialogFooter><Button onClick={() => createItem.mutate()} disabled={!form.sku || !form.name}>Create</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="divide-y">
            {!catalog?.length && <div className="p-10 text-center text-muted-foreground"><Package className="h-8 w-8 mx-auto mb-2 opacity-40" /> No items yet.</div>}
            {catalog?.map((c) => (
              <div key={c.id} className="p-4 flex justify-between">
                <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.sku} · {c.category}</p></div>
                <p className="text-sm">{c.unit_cost ? `$${c.unit_cost}` : "—"}</p>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}