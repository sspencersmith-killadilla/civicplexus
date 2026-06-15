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
import { Plus, Package } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/equipment")({ component: EquipmentPage });

const STAGES = ["requested", "picked", "issued", "returned"] as const;

function EquipmentPage() {
  const qc = useQueryClient();
  const { data: catalog } = useQuery({ queryKey: ["catalog"], queryFn: async () => (await supabase.from("equipment_catalog").select("*").order("name")).data ?? [] });
  const { data: issuance } = useQuery({ queryKey: ["issuance"], queryFn: async () => (await supabase.from("equipment_issuance").select("*, equipment_catalog(name), employees(first_name,last_name)").order("created_at", { ascending: false })).data ?? [] });

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
      const patch: Record<string, unknown> = { status };
      if (status === "issued") patch.issued_at = new Date().toISOString();
      if (status === "returned") patch.returned_at = new Date().toISOString();
      const { error } = await supabase.from("equipment_issuance").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issuance"] }),
  });

  return (
    <AppShell title="Equipment & PPE">
      <Tabs defaultValue="issuance">
        <TabsList>
          <TabsTrigger value="issuance">Issuance</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
        </TabsList>
        <TabsContent value="issuance" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {STAGES.map((s) => (
              <div key={s}>
                <h3 className="font-medium capitalize mb-3">{s}</h3>
                <div className="space-y-2">
                  {issuance?.filter((i) => i.status === s).map((i) => {
                    const idx = STAGES.indexOf(s);
                    return (
                      <Card key={i.id} className="p-3">
                        <p className="font-medium text-sm">{(i.equipment_catalog as { name: string } | null)?.name}</p>
                        <p className="text-xs text-muted-foreground">{(i.employees as { first_name: string; last_name: string } | null)?.first_name} {(i.employees as { first_name: string; last_name: string } | null)?.last_name}</p>
                        {i.size && <p className="text-xs">Size: {i.size}</p>}
                        {idx < STAGES.length - 1 && (
                          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => moveStage.mutate({ id: i.id, status: STAGES[idx + 1] })}>
                            → {STAGES[idx + 1]}
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