import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, GraduationCap, ShieldCheck, ClipboardList, CheckCircle2, Download, XCircle, Pencil, FileText, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useServerFn } from "@tanstack/react-start";
import { assignTraining, assignTrainingByWorkerType, completeTraining, updateTrainingDueDate, cancelTrainingAssignment } from "@/lib/training.functions";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/training")({ component: TrainingPage });

type Assignment = {
  id: string; status: string; due_date: string | null; completed_at: string | null; score: number | null;
  evidence_path: string | null;
  courses: { id: string; name: string; compliance_framework: string | null } | null;
  employees: { id: string; first_name: string; last_name: string; department: string | null; manager_id: string | null } | null;
};

type Course = {
  id: string; name: string; provider: string | null; description: string | null; materials_url: string | null;
  compliance_framework: string | null; required_for_worker_types: string[] | null;
  passing_score: number | null; recurrence_months: number | null;
  issues_certification_id: string | null; auto_assign_on_hire: boolean; active: boolean;
};

function isOverdue(a: Pick<Assignment, "status" | "due_date">) {
  return a.status !== "complete" && a.status !== "cancelled" && a.due_date != null && new Date(a.due_date) < new Date();
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) { toast.info("Nothing to export"); return; }
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function TrainingPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();

  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => (await supabase.from("courses").select("*").order("name")).data ?? [] as Course[],
  });
  const { data: certs } = useQuery({
    queryKey: ["certs"],
    queryFn: async () => (await supabase.from("certifications").select("*").order("name")).data ?? [],
  });
  const { data: empCerts } = useQuery({
    queryKey: ["emp-certs"],
    queryFn: async () => (await supabase.from("employee_certifications").select("*, certifications(name), employees(first_name,last_name,department)").order("expires_at", { ascending: true, nullsFirst: false })).data ?? [],
  });
  const { data: assignments } = useQuery({
    queryKey: ["emp-training"],
    queryFn: async () => (await supabase
      .from("employee_training")
      .select("id,status,due_date,completed_at,score,evidence_path,courses(id,name,compliance_framework),employees(id,first_name,last_name,department,manager_id)")
      .order("due_date", { ascending: true, nullsFirst: false })).data as Assignment[] ?? [],
  });
  const { data: employees } = useQuery({
    queryKey: ["employees-active"],
    queryFn: async () => (await supabase.from("employees").select("id,first_name,last_name").order("last_name")).data ?? [],
  });
  const { data: workerTypes } = useQuery({
    queryKey: ["worker-types"],
    queryFn: async () => (await supabase.from("worker_types").select("id,name").order("name")).data ?? [],
  });

  // Dialog state
  const [openAssign, setOpenAssign] = useState(false);
  const [assignMode, setAssignMode] = useState<"employees" | "worker_type">("employees");
  const [assign, setAssign] = useState({ course_id: "", worker_type_id: "", due_date: "", notes: "", employee_ids: [] as string[] });

  const [editCourse, setEditCourse] = useState<Partial<Course> | null>(null);
  const [editCert, setEditCert] = useState<{ id?: string; name: string; issuer: string; validity_months: string; compliance_framework: string } | null>(null);

  const [completeFor, setCompleteFor] = useState<Assignment | null>(null);
  const [completeForm, setCompleteForm] = useState<{ score: string; notes: string; file: File | null }>({ score: "", notes: "", file: null });

  const [editDueFor, setEditDueFor] = useState<Assignment | null>(null);
  const [editDueDate, setEditDueDate] = useState("");

  // Filters
  const [teamFilter, setTeamFilter] = useState<"all" | "team">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Server fns
  const assignFn = useServerFn(assignTraining);
  const assignWtFn = useServerFn(assignTrainingByWorkerType);
  const completeFn = useServerFn(completeTraining);
  const updateDueFn = useServerFn(updateTrainingDueDate);
  const cancelFn = useServerFn(cancelTrainingAssignment);

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

  const submitComplete = useMutation({
    mutationFn: async () => {
      if (!completeFor) throw new Error("No assignment");
      let evidence_path: string | undefined;
      if (completeForm.file && completeFor.employees) {
        const ext = completeForm.file.name.split(".").pop() ?? "bin";
        const path = `${completeFor.employees.id}/${completeFor.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("training-evidence").upload(path, completeForm.file, { upsert: false });
        if (upErr) throw new Error(upErr.message);
        evidence_path = path;
      }
      const score = completeForm.score === "" ? undefined : Number(completeForm.score);
      return completeFn({ data: { training_id: completeFor.id, score, notes: completeForm.notes || undefined, evidence_path } });
    },
    onSuccess: (res: { status: string }) => {
      toast.success(res.status === "failed" ? "Recorded as failed — score below passing" : "Marked complete");
      setCompleteFor(null);
      setCompleteForm({ score: "", notes: "", file: null });
      qc.invalidateQueries({ queryKey: ["emp-training"] });
      qc.invalidateQueries({ queryKey: ["emp-certs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitDue = useMutation({
    mutationFn: () => {
      if (!editDueFor) throw new Error("No row");
      return updateDueFn({ data: { training_id: editDueFor.id, due_date: editDueDate || null } });
    },
    onSuccess: () => { toast.success("Due date updated"); setEditDueFor(null); qc.invalidateQueries({ queryKey: ["emp-training"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const doCancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { training_id: id } }),
    onSuccess: () => { toast.success("Assignment cancelled"); qc.invalidateQueries({ queryKey: ["emp-training"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCourse = useMutation({
    mutationFn: async () => {
      if (!editCourse?.name) throw new Error("Name is required");
      const payload = {
        name: editCourse.name,
        provider: editCourse.provider ?? null,
        description: editCourse.description ?? null,
        materials_url: editCourse.materials_url ?? null,
        compliance_framework: editCourse.compliance_framework ?? null,
        required_for_worker_types: editCourse.required_for_worker_types ?? null,
        passing_score: editCourse.passing_score ?? null,
        recurrence_months: editCourse.recurrence_months ?? null,
        issues_certification_id: editCourse.issues_certification_id ?? null,
        auto_assign_on_hire: !!editCourse.auto_assign_on_hire,
      };
      const { error } = editCourse.id
        ? await supabase.from("courses").update(payload).eq("id", editCourse.id)
        : await supabase.from("courses").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Course saved"); setEditCourse(null); qc.invalidateQueries({ queryKey: ["courses"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCert = useMutation({
    mutationFn: async () => {
      if (!editCert?.name) throw new Error("Name is required");
      const payload = {
        name: editCert.name,
        issuer: editCert.issuer || null,
        validity_months: editCert.validity_months ? Number(editCert.validity_months) : null,
        compliance_framework: editCert.compliance_framework || null,
      };
      const { error } = editCert.id
        ? await supabase.from("certifications").update(payload).eq("id", editCert.id)
        : await supabase.from("certifications").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); setEditCert(null); qc.invalidateQueries({ queryKey: ["certs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Filtered list (Assignments tab)
  const filteredAssignments = useMemo(() => {
    const all = (assignments ?? []) as Assignment[];
    return all.filter((a) => {
      if (teamFilter === "team" && a.employees?.manager_id !== me?.user?.id) return false;
      if (statusFilter === "overdue" && !isOverdue(a)) return false;
      if (statusFilter === "assigned" && a.status !== "assigned") return false;
      if (statusFilter === "complete" && a.status !== "complete") return false;
      if (statusFilter === "cancelled" && a.status !== "cancelled") return false;
      return true;
    });
  }, [assignments, teamFilter, statusFilter, me?.user?.id]);

  function exportAssignments() {
    downloadCsv("training-assignments.csv", filteredAssignments.map((a) => ({
      employee: `${a.employees?.first_name ?? ""} ${a.employees?.last_name ?? ""}`.trim(),
      department: a.employees?.department ?? "",
      course: a.courses?.name ?? "",
      framework: a.courses?.compliance_framework ?? "",
      due_date: a.due_date ?? "",
      status: isOverdue(a) ? "overdue" : a.status,
      completed_at: a.completed_at ?? "",
      score: a.score ?? "",
    })));
  }

  // Compliance roll-ups
  const compliance = useMemo(() => {
    const all = (assignments ?? []) as Assignment[];
    const buckets = (key: (a: Assignment) => string | null | undefined) => {
      const map = new Map<string, { total: number; complete: number; overdue: number }>();
      for (const a of all) {
        const k = key(a) ?? "—";
        const b = map.get(k) ?? { total: 0, complete: 0, overdue: 0 };
        b.total++;
        if (a.status === "complete") b.complete++;
        if (isOverdue(a)) b.overdue++;
        map.set(k, b);
      }
      return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    };
    return {
      total: all.length,
      complete: all.filter((a) => a.status === "complete").length,
      overdue: all.filter(isOverdue).length,
      byDept: buckets((a) => a.employees?.department ?? null),
      byFramework: buckets((a) => a.courses?.compliance_framework ?? null),
    };
  }, [assignments]);

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
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="expiry">Cert Expiry</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="certs">Certification Types</TabsTrigger>
        </TabsList>

        {/* ASSIGNMENTS */}
        <TabsContent value="assignments" className="mt-6 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v as never)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  <SelectItem value="team">My team only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">
                {filteredAssignments.length} of {assignments?.length ?? 0}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportAssignments}><Download className="h-4 w-4 mr-1" /> Export</Button>
              <Button onClick={() => setOpenAssign(true)}><Plus className="h-4 w-4 mr-2" /> Assign Training</Button>
            </div>
          </div>

          <Card className="divide-y">
            {!filteredAssignments.length && <div className="p-10 text-center text-muted-foreground"><ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" /> No matching assignments.</div>}
            {filteredAssignments.map((a) => {
              const overdue = isOverdue(a);
              return (
                <div key={a.id} className="p-4 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{a.courses?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.employees?.first_name} {a.employees?.last_name}
                      {a.employees?.department ? ` · ${a.employees.department}` : ""}
                      {" · "}{a.due_date ? `due ${a.due_date}` : "no due date"}
                      {a.score != null ? ` · score ${a.score}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.status === "complete" ? (
                      <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Complete</Badge>
                    ) : a.status === "cancelled" ? (
                      <Badge variant="outline">Cancelled</Badge>
                    ) : a.status === "failed" ? (
                      <Badge variant="destructive">Failed</Badge>
                    ) : overdue ? (
                      <Badge variant="destructive">Overdue</Badge>
                    ) : (
                      <Badge variant="outline">{a.status}</Badge>
                    )}
                    {a.status !== "complete" && a.status !== "cancelled" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setCompleteFor(a); setCompleteForm({ score: "", notes: "", file: null }); }}>Complete</Button>
                        <Button size="icon" variant="ghost" title="Edit due date" onClick={() => { setEditDueFor(a); setEditDueDate(a.due_date ?? ""); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Cancel" onClick={() => doCancel.mutate(a.id)}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </TabsContent>

        {/* COMPLIANCE */}
        <TabsContent value="compliance" className="mt-6 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Total assignments</div>
              <div className="text-2xl font-semibold mt-1">{compliance.total}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Completion rate</div>
              <div className="text-2xl font-semibold mt-1">{compliance.total ? Math.round((compliance.complete / compliance.total) * 100) : 0}%</div>
              <div className="text-xs text-muted-foreground mt-1">{compliance.complete} complete</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Overdue</div>
              <div className="text-2xl font-semibold mt-1 text-destructive">{compliance.overdue}</div>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-medium flex items-center gap-2 mb-3"><BarChart3 className="h-4 w-4 text-primary" /> By department</h3>
              <div className="space-y-2">
                {compliance.byDept.map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-sm"><span>{k}</span><span className="text-muted-foreground">{v.complete}/{v.total}{v.overdue ? ` · ${v.overdue} overdue` : ""}</span></div>
                    <div className="h-2 bg-muted rounded mt-1"><div className="h-full bg-primary rounded" style={{ width: `${v.total ? (v.complete / v.total) * 100 : 0}%` }} /></div>
                  </div>
                ))}
                {!compliance.byDept.length && <p className="text-sm text-muted-foreground">No data.</p>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-medium flex items-center gap-2 mb-3"><BarChart3 className="h-4 w-4 text-primary" /> By compliance framework</h3>
              <div className="space-y-2">
                {compliance.byFramework.map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-sm"><span>{k}</span><span className="text-muted-foreground">{v.complete}/{v.total}{v.overdue ? ` · ${v.overdue} overdue` : ""}</span></div>
                    <div className="h-2 bg-muted rounded mt-1"><div className="h-full bg-primary rounded" style={{ width: `${v.total ? (v.complete / v.total) * 100 : 0}%` }} /></div>
                  </div>
                ))}
                {!compliance.byFramework.length && <p className="text-sm text-muted-foreground">No data.</p>}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* CERT EXPIRY */}
        <TabsContent value="expiry" className="mt-6 space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => downloadCsv("certification-expiry.csv", (empCerts ?? []).map((e) => {
              const ec = e as { expires_at: string | null; certifications: { name: string } | null; employees: { first_name: string; last_name: string; department: string | null } | null };
              return {
                employee: `${ec.employees?.first_name ?? ""} ${ec.employees?.last_name ?? ""}`.trim(),
                department: ec.employees?.department ?? "",
                certification: ec.certifications?.name ?? "",
                expires_at: ec.expires_at ?? "",
              };
            }))}><Download className="h-4 w-4 mr-1" /> Export</Button>
          </div>
          <Card className="divide-y">
            {!empCerts?.length && <div className="p-10 text-center text-muted-foreground"><ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" /> No certifications tracked.</div>}
            {empCerts?.map((e) => {
              const ec = e as { id: string; expires_at: string | null; certifications: { name: string } | null; employees: { first_name: string; last_name: string; department: string | null } | null };
              return (
                <div key={ec.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{ec.certifications?.name}</p>
                    <p className="text-xs text-muted-foreground">{ec.employees?.first_name} {ec.employees?.last_name}{ec.employees?.department ? ` · ${ec.employees.department}` : ""}</p>
                  </div>
                  {expiryBadge(ec.expires_at)}
                </div>
              );
            })}
          </Card>
        </TabsContent>

        {/* COURSES */}
        <TabsContent value="courses" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setEditCourse({ name: "", auto_assign_on_hire: false })}><Plus className="h-4 w-4 mr-2" /> Add Course</Button>
          </div>
          <Card className="divide-y">
            {!courses?.length && <div className="p-10 text-center text-muted-foreground"><GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-40" /> No courses yet.</div>}
            {(courses ?? []).map((c) => {
              const cc = c as Course;
              return (
                <div key={cc.id} className="p-4 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <p className="font-medium flex items-center gap-2">
                      {cc.name}
                      {cc.auto_assign_on_hire && <Badge variant="secondary" className="text-[10px]">auto-assign</Badge>}
                      {cc.recurrence_months ? <Badge variant="outline" className="text-[10px]">every {cc.recurrence_months}mo</Badge> : null}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {cc.provider || "—"}{cc.compliance_framework ? ` · ${cc.compliance_framework}` : ""}
                      {cc.required_for_worker_types?.length ? ` · required: ${cc.required_for_worker_types.join(", ")}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditCourse(cc)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
                </div>
              );
            })}
          </Card>
        </TabsContent>

        {/* CERT TYPES */}
        <TabsContent value="certs" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setEditCert({ name: "", issuer: "", validity_months: "12", compliance_framework: "" })}><Plus className="h-4 w-4 mr-2" /> Add Certification</Button>
          </div>
          <Card className="divide-y">
            {(certs ?? []).map((c) => {
              const cc = c as { id: string; name: string; issuer: string | null; validity_months: number | null; compliance_framework: string | null };
              return (
                <div key={cc.id} className="p-4 flex justify-between items-center gap-3">
                  <div>
                    <p className="font-medium">{cc.name}</p>
                    <p className="text-xs text-muted-foreground">{cc.issuer || "—"} · valid {cc.validity_months ?? "—"}mo · {cc.compliance_framework ?? "—"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditCert({ id: cc.id, name: cc.name, issuer: cc.issuer ?? "", validity_months: String(cc.validity_months ?? ""), compliance_framework: cc.compliance_framework ?? "" })}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
                </div>
              );
            })}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Assign dialog */}
      <Dialog open={openAssign} onOpenChange={setOpenAssign}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Training</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Course</Label>
              <Select value={assign.course_id} onValueChange={(v) => setAssign({ ...assign, course_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choose a course" /></SelectTrigger>
                <SelectContent>{(courses ?? []).map((c) => (<SelectItem key={(c as Course).id} value={(c as Course).id}>{(c as Course).name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div><Label>Due date</Label><Input type="date" value={assign.due_date} onChange={(e) => setAssign({ ...assign, due_date: e.target.value })} /></div>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => setAssignMode("employees")} className={`px-2 py-1 rounded ${assignMode === "employees" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Pick employees</button>
              <button type="button" onClick={() => setAssignMode("worker_type")} className={`px-2 py-1 rounded ${assignMode === "worker_type" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>By worker type</button>
            </div>
            {assignMode === "employees" ? (
              <div className="max-h-56 overflow-y-auto border rounded p-2 space-y-1">
                {(employees ?? []).map((e) => {
                  const emp = e as { id: string; first_name: string; last_name: string };
                  return (
                    <label key={emp.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={assign.employee_ids.includes(emp.id)} onCheckedChange={(c) => setAssign((a) => ({ ...a, employee_ids: c ? [...a.employee_ids, emp.id] : a.employee_ids.filter((x) => x !== emp.id) }))} />
                      {emp.first_name} {emp.last_name}
                    </label>
                  );
                })}
              </div>
            ) : (
              <div><Label>Worker Type</Label>
                <Select value={assign.worker_type_id} onValueChange={(v) => setAssign({ ...assign, worker_type_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose a worker type" /></SelectTrigger>
                  <SelectContent>{(workerTypes ?? []).map((w) => { const wt = w as { id: string; name: string }; return <SelectItem key={wt.id} value={wt.id}>{wt.name}</SelectItem>; })}</SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Notes (optional)</Label><Textarea rows={2} value={assign.notes} onChange={(e) => setAssign({ ...assign, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => doAssign.mutate()} disabled={doAssign.isPending}>Assign</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete dialog */}
      <Dialog open={!!completeFor} onOpenChange={(o) => !o && setCompleteFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark complete: {completeFor?.courses?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Score (optional)</Label><Input type="number" min={0} max={100} value={completeForm.score} onChange={(e) => setCompleteForm({ ...completeForm, score: e.target.value })} placeholder="0–100" /></div>
            <div><Label>Notes</Label><Textarea rows={2} value={completeForm.notes} onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })} /></div>
            <div><Label>Proof of completion (PDF or image, optional)</Label>
              <Input type="file" accept="application/pdf,image/*" onChange={(e) => setCompleteForm({ ...completeForm, file: e.target.files?.[0] ?? null })} />
              <p className="text-xs text-muted-foreground mt-1">Stored privately and visible to HR and your supervisor.</p>
            </div>
          </div>
          <DialogFooter><Button onClick={() => submitComplete.mutate()} disabled={submitComplete.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit due date dialog */}
      <Dialog open={!!editDueFor} onOpenChange={(o) => !o && setEditDueFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change due date</DialogTitle></DialogHeader>
          <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
          <DialogFooter><Button onClick={() => submitDue.mutate()} disabled={submitDue.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Course editor */}
      <Dialog open={!!editCourse} onOpenChange={(o) => !o && setEditCourse(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editCourse?.id ? "Edit course" : "New course"}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><Label>Name</Label><Input value={editCourse?.name ?? ""} onChange={(e) => setEditCourse((c) => ({ ...c!, name: e.target.value }))} /></div>
            <div><Label>Provider</Label><Input value={editCourse?.provider ?? ""} onChange={(e) => setEditCourse((c) => ({ ...c!, provider: e.target.value }))} /></div>
            <div><Label>Compliance framework</Label><Input value={editCourse?.compliance_framework ?? ""} onChange={(e) => setEditCourse((c) => ({ ...c!, compliance_framework: e.target.value }))} placeholder="OSHA / CJIS / HIPAA" /></div>
            <div className="sm:col-span-2"><Label>Description</Label><Textarea rows={2} value={editCourse?.description ?? ""} onChange={(e) => setEditCourse((c) => ({ ...c!, description: e.target.value }))} /></div>
            <div className="sm:col-span-2"><Label>Materials URL</Label><Input value={editCourse?.materials_url ?? ""} onChange={(e) => setEditCourse((c) => ({ ...c!, materials_url: e.target.value }))} placeholder="https://…" /></div>
            <div><Label>Passing score</Label><Input type="number" min={0} max={100} value={editCourse?.passing_score ?? ""} onChange={(e) => setEditCourse((c) => ({ ...c!, passing_score: e.target.value === "" ? null : Number(e.target.value) }))} /></div>
            <div><Label>Recurs every (months)</Label><Input type="number" min={0} value={editCourse?.recurrence_months ?? ""} onChange={(e) => setEditCourse((c) => ({ ...c!, recurrence_months: e.target.value === "" ? null : Number(e.target.value) }))} /></div>
            <div className="sm:col-span-2"><Label>On completion, issue certification</Label>
              <Select value={editCourse?.issues_certification_id ?? "none"} onValueChange={(v) => setEditCourse((c) => ({ ...c!, issues_certification_id: v === "none" ? null : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none —</SelectItem>
                  {(certs ?? []).map((c) => { const cc = c as { id: string; name: string }; return <SelectItem key={cc.id} value={cc.id}>{cc.name}</SelectItem>; })}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Required for worker types</Label>
              <div className="border rounded p-2 max-h-32 overflow-y-auto space-y-1">
                {(workerTypes ?? []).map((w) => {
                  const wt = w as { id: string; name: string };
                  const arr = editCourse?.required_for_worker_types ?? [];
                  return (
                    <label key={wt.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={arr.includes(wt.name)} onCheckedChange={(chk) => setEditCourse((c) => ({ ...c!, required_for_worker_types: chk ? [...arr, wt.name] : arr.filter((x) => x !== wt.name) }))} />
                      {wt.name}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2"><Switch checked={!!editCourse?.auto_assign_on_hire} onCheckedChange={(v) => setEditCourse((c) => ({ ...c!, auto_assign_on_hire: v }))} /> <Label>Auto-assign to every new hire</Label></div>
          </div>
          <DialogFooter><Button onClick={() => saveCourse.mutate()} disabled={saveCourse.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cert editor */}
      <Dialog open={!!editCert} onOpenChange={(o) => !o && setEditCert(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editCert?.id ? "Edit certification type" : "New certification type"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={editCert?.name ?? ""} onChange={(e) => setEditCert((c) => ({ ...c!, name: e.target.value }))} /></div>
            <div><Label>Issuer</Label><Input value={editCert?.issuer ?? ""} onChange={(e) => setEditCert((c) => ({ ...c!, issuer: e.target.value }))} /></div>
            <div><Label>Validity (months)</Label><Input type="number" value={editCert?.validity_months ?? ""} onChange={(e) => setEditCert((c) => ({ ...c!, validity_months: e.target.value }))} /></div>
            <div><Label>Compliance framework</Label><Input value={editCert?.compliance_framework ?? ""} onChange={(e) => setEditCert((c) => ({ ...c!, compliance_framework: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => saveCert.mutate()} disabled={saveCert.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// Suppress unused import warning - keep available for future transcript drill-down
void Link; void FileText;