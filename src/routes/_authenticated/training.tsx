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
import { Badge } from "@/components/ui/badge";
import { Plus, GraduationCap, ShieldCheck, ClipboardList, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useServerFn } from "@tanstack/react-start";
import { assignTraining, assignTrainingByWorkerType, completeTraining } from "@/lib/training.functions";

export const Route = createFileRoute("/_authenticated/training")({ component: TrainingPage });

function TrainingPage() {
  const qc = useQueryClient();
  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: async () => (await supabase.from("courses").select("*").order("name")).data ?? [] });
  const { data: certs } = useQuery({ queryKey: ["certs"], queryFn: async () => (await supabase.from("certifications").select("*").order("name")).data ?? [] });
  const { data: empCerts } = useQuery({ queryKey: ["emp-certs"], queryFn: async () => (await supabase.from("employee_certifications").select("*, certifications(name), employees(first_name,last_name)")).data ?? [] });
  const { data: assignments } = useQuery({
    queryKey: ["emp-training"],
    queryFn: async () => (await supabase
      .from("employee_training")
      .select("id,status,due_date,completed_at,score,courses(name),employees(id,first_name,last_name,manager_id)")
      .order("due_date", { ascending: true, nullsFirst: false })).data ?? [],
  });
  const { data: employees } = useQuery({
    queryKey: ["employees-active"],
    queryFn: async () => (await supabase.from("employees").select("id,first_name,last_name").order("last_name")).data ?? [],
  });
  const { data: workerTypes } = useQuery({
    queryKey: ["worker-types"],
    queryFn: async () => (await supabase.from("worker_types").select("id,name").order("name")).data ?? [],
  });

  const [openC, setOpenC] = useState(false);
  const [openCert, setOpenCert] = useState(false);
  const [course, setCourse] = useState({ name: "", provider: "", compliance_framework: "" });
  const [cert, setCert] = useState({ name: "", issuer: "", validity_months: "12", compliance_framework: "" });
  const [openAssign, setOpenAssign] = useState(false);
  const [assignMode, setAssignMode] = useState<"employees" | "worker_type">("employees");
  const [assign, setAssign] = useState<{ course_id: string; worker_type_id: string; due_date: string; notes: string; employee_ids: string[] }>({ course_id: "", worker_type_id: "", due_date: "", notes: "", employee_ids: [] });

  const assignFn = useServerFn(assignTraining);
  const assignWtFn = useServerFn(assignTrainingByWorkerType);
  const completeFn = useServerFn(completeTraining);

  const doAssign = useMutation({
    mutationFn: async () => {
      if (assignMode === "employees") {
        if (!assign.course_id || !assign.employee_ids.length) throw new Error("Pick a course and at least one employee");
        return assignFn({ data: { course_id: assign.course_id, employee_ids: assign.employee_ids, due_date: assign.due_date || null, notes: assign.notes || undefined } });
      }
      if (!assign.course_id || !assign.worker_type_id) throw new Error("Pick a course and worker type");
      return assignWtFn({ data: { course_id: assign.course_id, worker_type_id: assign.worker_type_id, due_date: assign.due_date || null, notes: assign.notes || undefined } });
    },
    onSuccess: (res: { assigned: number }) => {
      toast.success(`Assigned to ${res.assigned} employee${res.assigned === 1 ? "" : "s"}`);
      setOpenAssign(false);
      setAssign({ course_id: "", worker_type_id: "", due_date: "", notes: "", employee_ids: [] });
      qc.invalidateQueries({ queryKey: ["emp-training"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markComplete = useMutation({
    mutationFn: (training_id: string) => completeFn({ data: { training_id } }),
    onSuccess: () => { toast.success("Marked complete"); qc.invalidateQueries({ queryKey: ["emp-training"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCourse = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("courses").insert(course); if (error) throw error; },
    onSuccess: () => { toast.success("Course added"); setOpenC(false); setCourse({ name: "", provider: "", compliance_framework: "" }); qc.invalidateQueries({ queryKey: ["courses"] }); },
  });
  const addCert = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("certifications").insert({ ...cert, validity_months: cert.validity_months ? Number(cert.validity_months) : null }); if (error) throw error; },
    onSuccess: () => { toast.success("Certification added"); setOpenCert(false); qc.invalidateQueries({ queryKey: ["certs"] }); },
  });

  function expiryBadge(d: string | null) {
    if (!d) return <Badge variant="outline">No expiry</Badge>;
    const days = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
    if (days < 0) return <Badge variant="destructive">Expired</Badge>;
    if (days < 30) return <Badge className="bg-red-500">{days}d</Badge>;
    if (days < 90) return <Badge className="bg-amber-500">{days}d</Badge>;
    return <Badge variant="secondary">{days}d</Badge>;
  }

  return (
    <AppShell title="Training & Certifications">
      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="expiry">Cert Expiry</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="certs">Certification Types</TabsTrigger>
        </TabsList>
        <TabsContent value="assignments" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {(assignments?.length ?? 0)} assignment{(assignments?.length ?? 0) === 1 ? "" : "s"} · {(assignments ?? []).filter((a) => a.status !== "complete" && a.due_date && new Date(a.due_date as string) < new Date()).length} overdue
            </p>
            <Dialog open={openAssign} onOpenChange={setOpenAssign}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Assign Training</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign Training</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Course</Label>
                    <Select value={assign.course_id} onValueChange={(v) => setAssign({ ...assign, course_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Choose a course" /></SelectTrigger>
                      <SelectContent>
                        {(courses ?? []).map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Due date</Label>
                    <Input type="date" value={assign.due_date} onChange={(e) => setAssign({ ...assign, due_date: e.target.value })} />
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button type="button" onClick={() => setAssignMode("employees")} className={`px-2 py-1 rounded ${assignMode === "employees" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Pick employees</button>
                    <button type="button" onClick={() => setAssignMode("worker_type")} className={`px-2 py-1 rounded ${assignMode === "worker_type" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>By worker type</button>
                  </div>
                  {assignMode === "employees" ? (
                    <div className="max-h-56 overflow-y-auto border rounded p-2 space-y-1">
                      {(employees ?? []).map((e) => (
                        <label key={e.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={assign.employee_ids.includes(e.id)}
                            onCheckedChange={(c) => setAssign((a) => ({
                              ...a,
                              employee_ids: c ? [...a.employee_ids, e.id] : a.employee_ids.filter((x) => x !== e.id),
                            }))}
                          />
                          {e.first_name} {e.last_name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <Label>Worker Type</Label>
                      <Select value={assign.worker_type_id} onValueChange={(v) => setAssign({ ...assign, worker_type_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Choose a worker type" /></SelectTrigger>
                        <SelectContent>
                          {(workerTypes ?? []).map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>Notes (optional)</Label>
                    <Textarea rows={2} value={assign.notes} onChange={(e) => setAssign({ ...assign, notes: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => doAssign.mutate()} disabled={doAssign.isPending}>Assign</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="divide-y">
            {!assignments?.length && <div className="p-10 text-center text-muted-foreground"><ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" /> No training assigned.</div>}
            {(assignments ?? []).map((a) => {
              const emp = a.employees as { first_name: string; last_name: string } | null;
              const co = a.courses as { name: string } | null;
              const overdue = a.status !== "complete" && a.due_date && new Date(a.due_date as string) < new Date();
              return (
                <div key={a.id} className="p-4 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{co?.name}</p>
                    <p className="text-xs text-muted-foreground">{emp?.first_name} {emp?.last_name} · {a.due_date ? `due ${a.due_date}` : "no due date"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === "complete" ? (
                      <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Complete</Badge>
                    ) : overdue ? (
                      <Badge variant="destructive">Overdue</Badge>
                    ) : (
                      <Badge variant="outline">{a.status}</Badge>
                    )}
                    {a.status !== "complete" && (
                      <Button size="sm" variant="outline" disabled={markComplete.isPending} onClick={() => markComplete.mutate(a.id)}>Mark complete</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </TabsContent>
        <TabsContent value="expiry" className="mt-6">
          <Card className="divide-y">
            {!empCerts?.length && <div className="p-10 text-center text-muted-foreground"><ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" /> No certifications tracked.</div>}
            {empCerts?.map((e) => (
              <div key={e.id} className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-medium">{(e.certifications as { name: string } | null)?.name}</p>
                  <p className="text-xs text-muted-foreground">{(e.employees as { first_name: string; last_name: string } | null)?.first_name} {(e.employees as { first_name: string; last_name: string } | null)?.last_name}</p>
                </div>
                {expiryBadge(e.expires_at)}
              </div>
            ))}
          </Card>
        </TabsContent>
        <TabsContent value="courses" className="mt-6">
          <div className="flex justify-end mb-4">
            <Dialog open={openC} onOpenChange={setOpenC}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Course</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Course</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Name</Label><Input value={course.name} onChange={(e) => setCourse({ ...course, name: e.target.value })} /></div>
                  <div><Label>Provider</Label><Input value={course.provider} onChange={(e) => setCourse({ ...course, provider: e.target.value })} /></div>
                  <div><Label>Compliance Framework</Label><Input placeholder="OSHA / CJIS / HIPAA" value={course.compliance_framework} onChange={(e) => setCourse({ ...course, compliance_framework: e.target.value })} /></div>
                </div>
                <DialogFooter><Button onClick={() => addCourse.mutate()} disabled={!course.name}>Create</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="divide-y">
            {!courses?.length && <div className="p-10 text-center text-muted-foreground"><GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-40" /> No courses yet.</div>}
            {courses?.map((c) => (
              <div key={c.id} className="p-4 flex justify-between">
                <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.provider} · {c.compliance_framework}</p></div>
              </div>
            ))}
          </Card>
        </TabsContent>
        <TabsContent value="certs" className="mt-6">
          <div className="flex justify-end mb-4">
            <Dialog open={openCert} onOpenChange={setOpenCert}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Certification</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Certification Type</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Name</Label><Input value={cert.name} onChange={(e) => setCert({ ...cert, name: e.target.value })} /></div>
                  <div><Label>Issuer</Label><Input value={cert.issuer} onChange={(e) => setCert({ ...cert, issuer: e.target.value })} /></div>
                  <div><Label>Validity (months)</Label><Input type="number" value={cert.validity_months} onChange={(e) => setCert({ ...cert, validity_months: e.target.value })} /></div>
                  <div><Label>Compliance Framework</Label><Input value={cert.compliance_framework} onChange={(e) => setCert({ ...cert, compliance_framework: e.target.value })} /></div>
                </div>
                <DialogFooter><Button onClick={() => addCert.mutate()} disabled={!cert.name}>Create</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="divide-y">
            {certs?.map((c) => (
              <div key={c.id} className="p-4 flex justify-between">
                <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.issuer} · valid {c.validity_months}mo · {c.compliance_framework}</p></div>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}