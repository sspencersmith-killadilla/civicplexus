import { createFileRoute } from "@tanstack/react-router";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cba")({ component: CbaPage });

function CbaPage() {
  const qc = useQueryClient();
  const unitsQ = useQuery({ queryKey: ["bargaining-units"], queryFn: async () => {
    const { data, error } = await supabase.from("bargaining_units").select("*").order("name");
    if (error) throw error; return data ?? [];
  }});
  const contractsQ = useQuery({ queryKey: ["cba-contracts"], queryFn: async () => {
    const { data, error } = await supabase.from("cba_contracts").select("*, bargaining_units(name)").order("effective_from", { ascending: false });
    if (error) throw error; return data ?? [];
  }});
  const stepsQ = useQuery({ queryKey: ["cba-steps"], queryFn: async () => {
    const { data, error } = await supabase.from("cba_step_tables").select("*").order("grade").order("step");
    if (error) throw error; return data ?? [];
  }});
  const longevityQ = useQuery({ queryKey: ["cba-longevity"], queryFn: async () => {
    const { data, error } = await supabase.from("cba_longevity_rules").select("*").order("years_of_service");
    if (error) throw error; return data ?? [];
  }});

  const [unitForm, setUnitForm] = useState({ name: "", code: "", description: "" });
  const createUnit = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("bargaining_units").insert(unitForm as never); if (error) throw error; },
    onSuccess: () => { toast.success("Unit added"); setUnitForm({ name: "", code: "", description: "" }); qc.invalidateQueries({ queryKey: ["bargaining-units"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [contractForm, setContractForm] = useState({ bargaining_unit_id: "", name: "", effective_from: "", effective_to: "", document_url: "" });
  const createContract = useMutation({
    mutationFn: async () => {
      const payload = { ...contractForm, effective_to: contractForm.effective_to || null, document_url: contractForm.document_url || null };
      const { error } = await supabase.from("cba_contracts").insert(payload as never); if (error) throw error;
    },
    onSuccess: () => { toast.success("Contract added"); setContractForm({ bargaining_unit_id: "", name: "", effective_from: "", effective_to: "", document_url: "" }); qc.invalidateQueries({ queryKey: ["cba-contracts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [stepForm, setStepForm] = useState({ contract_id: "", grade: "", step: "1", hourly_rate: "", annual_rate: "" });
  const createStep = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cba_step_tables").insert({
        contract_id: stepForm.contract_id, grade: stepForm.grade, step: Number(stepForm.step),
        hourly_rate: stepForm.hourly_rate ? Number(stepForm.hourly_rate) : null,
        annual_rate: stepForm.annual_rate ? Number(stepForm.annual_rate) : null,
      } as never); if (error) throw error;
    },
    onSuccess: () => { toast.success("Step added"); qc.invalidateQueries({ queryKey: ["cba-steps"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [lForm, setLForm] = useState({ contract_id: "", years_of_service: "5", monthly_amount: "" });
  const createLongevity = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cba_longevity_rules").insert({
        contract_id: lForm.contract_id, years_of_service: Number(lForm.years_of_service),
        monthly_amount: lForm.monthly_amount ? Number(lForm.monthly_amount) : null,
      } as never); if (error) throw error;
    },
    onSuccess: () => { toast.success("Rule added"); qc.invalidateQueries({ queryKey: ["cba-longevity"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Collective Bargaining Agreements">
      <p className="text-sm text-muted-foreground mb-4">Define bargaining units, contracts, step pay tables, and longevity pay rules. Step progression and longevity calculations feed payroll exports and personnel actions.</p>
      <Tabs defaultValue="units">
        <TabsList>
          <TabsTrigger value="units">Bargaining units</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="steps">Step tables</TabsTrigger>
          <TabsTrigger value="longevity">Longevity</TabsTrigger>
        </TabsList>

        <TabsContent value="units">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium">Bargaining units</h3>
              <Dialog>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>New bargaining unit</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Name</Label><Input value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="McKinney Police Association" /></div>
                    <div><Label>Code</Label><Input value={unitForm.code} onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value })} placeholder="MPA" /></div>
                    <div><Label>Description</Label><Textarea value={unitForm.description} onChange={(e) => setUnitForm({ ...unitForm, description: e.target.value })} /></div>
                  </div>
                  <DialogFooter><Button disabled={!unitForm.name} onClick={() => createUnit.mutate()}>Save</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Description</TableHead></TableRow></TableHeader><TableBody>
              {(unitsQ.data ?? []).map((u: any) => <TableRow key={u.id}><TableCell>{u.name}</TableCell><TableCell>{u.code}</TableCell><TableCell>{u.description}</TableCell></TableRow>)}
              {(unitsQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No units yet.</TableCell></TableRow>}
            </TableBody></Table>
          </Card>
        </TabsContent>

        <TabsContent value="contracts">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium">Contracts</h3>
              <Dialog>
                <DialogTrigger asChild><Button size="sm" disabled={(unitsQ.data?.length ?? 0) === 0}><Plus className="h-4 w-4 mr-1" /> Add</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>New contract</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Bargaining unit</Label><Select value={contractForm.bargaining_unit_id} onValueChange={(v) => setContractForm({ ...contractForm, bargaining_unit_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Pick a unit" /></SelectTrigger>
                      <SelectContent>{(unitsQ.data ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                    </Select></div>
                    <div><Label>Contract name</Label><Input value={contractForm.name} onChange={(e) => setContractForm({ ...contractForm, name: e.target.value })} placeholder="2025-2028 MPA Agreement" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Effective from</Label><Input type="date" value={contractForm.effective_from} onChange={(e) => setContractForm({ ...contractForm, effective_from: e.target.value })} /></div>
                      <div><Label>Effective to</Label><Input type="date" value={contractForm.effective_to} onChange={(e) => setContractForm({ ...contractForm, effective_to: e.target.value })} /></div>
                    </div>
                    <div><Label>Document URL</Label><Input value={contractForm.document_url} onChange={(e) => setContractForm({ ...contractForm, document_url: e.target.value })} /></div>
                  </div>
                  <DialogFooter><Button disabled={!contractForm.name || !contractForm.bargaining_unit_id || !contractForm.effective_from} onClick={() => createContract.mutate()}>Save</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Unit</TableHead><TableHead>Effective</TableHead><TableHead>Doc</TableHead></TableRow></TableHeader><TableBody>
              {(contractsQ.data ?? []).map((c: any) => <TableRow key={c.id}><TableCell>{c.name}</TableCell><TableCell>{c.bargaining_units?.name}</TableCell><TableCell className="text-xs">{c.effective_from} → {c.effective_to ?? "open"}</TableCell><TableCell>{c.document_url ? <a href={c.document_url} className="text-primary underline text-xs" target="_blank" rel="noreferrer">link</a> : "—"}</TableCell></TableRow>)}
              {(contractsQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No contracts yet.</TableCell></TableRow>}
            </TableBody></Table>
          </Card>
        </TabsContent>

        <TabsContent value="steps">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium">Step pay tables</h3>
              <Dialog>
                <DialogTrigger asChild><Button size="sm" disabled={(contractsQ.data?.length ?? 0) === 0}><Plus className="h-4 w-4 mr-1" /> Add step</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add step</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Contract</Label><Select value={stepForm.contract_id} onValueChange={(v) => setStepForm({ ...stepForm, contract_id: v })}><SelectTrigger><SelectValue placeholder="Pick contract" /></SelectTrigger><SelectContent>{(contractsQ.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Grade</Label><Input value={stepForm.grade} onChange={(e) => setStepForm({ ...stepForm, grade: e.target.value })} placeholder="PO" /></div>
                      <div><Label>Step</Label><Input type="number" value={stepForm.step} onChange={(e) => setStepForm({ ...stepForm, step: e.target.value })} /></div>
                      <div><Label>Hourly rate</Label><Input type="number" step="0.0001" value={stepForm.hourly_rate} onChange={(e) => setStepForm({ ...stepForm, hourly_rate: e.target.value })} /></div>
                      <div><Label>Annual rate</Label><Input type="number" value={stepForm.annual_rate} onChange={(e) => setStepForm({ ...stepForm, annual_rate: e.target.value })} /></div>
                    </div>
                  </div>
                  <DialogFooter><Button disabled={!stepForm.contract_id || !stepForm.grade} onClick={() => createStep.mutate()}>Save</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table><TableHeader><TableRow><TableHead>Grade</TableHead><TableHead>Step</TableHead><TableHead className="text-right">Hourly</TableHead><TableHead className="text-right">Annual</TableHead></TableRow></TableHeader><TableBody>
              {(stepsQ.data ?? []).map((s: any) => <TableRow key={s.id}><TableCell>{s.grade}</TableCell><TableCell>{s.step}</TableCell><TableCell className="text-right">{s.hourly_rate ?? "—"}</TableCell><TableCell className="text-right">{s.annual_rate ?? "—"}</TableCell></TableRow>)}
              {(stepsQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No steps yet.</TableCell></TableRow>}
            </TableBody></Table>
          </Card>
        </TabsContent>

        <TabsContent value="longevity">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium">Longevity rules</h3>
              <Dialog>
                <DialogTrigger asChild><Button size="sm" disabled={(contractsQ.data?.length ?? 0) === 0}><Plus className="h-4 w-4 mr-1" /> Add rule</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Longevity rule</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Contract</Label><Select value={lForm.contract_id} onValueChange={(v) => setLForm({ ...lForm, contract_id: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(contractsQ.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Years of service</Label><Input type="number" value={lForm.years_of_service} onChange={(e) => setLForm({ ...lForm, years_of_service: e.target.value })} /></div>
                      <div><Label>Monthly amount</Label><Input type="number" step="0.01" value={lForm.monthly_amount} onChange={(e) => setLForm({ ...lForm, monthly_amount: e.target.value })} /></div>
                    </div>
                  </div>
                  <DialogFooter><Button disabled={!lForm.contract_id} onClick={() => createLongevity.mutate()}>Save</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table><TableHeader><TableRow><TableHead>Years of service</TableHead><TableHead className="text-right">Monthly</TableHead></TableRow></TableHeader><TableBody>
              {(longevityQ.data ?? []).map((l: any) => <TableRow key={l.id}><TableCell>{l.years_of_service}+</TableCell><TableCell className="text-right">${l.monthly_amount ?? "—"}</TableCell></TableRow>)}
              {(longevityQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-4">No rules yet.</TableCell></TableRow>}
            </TableBody></Table>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
