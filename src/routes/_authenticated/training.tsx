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
import { Plus, GraduationCap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/training")({ component: TrainingPage });

function TrainingPage() {
  const qc = useQueryClient();
  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: async () => (await supabase.from("courses").select("*").order("name")).data ?? [] });
  const { data: certs } = useQuery({ queryKey: ["certs"], queryFn: async () => (await supabase.from("certifications").select("*").order("name")).data ?? [] });
  const { data: empCerts } = useQuery({ queryKey: ["emp-certs"], queryFn: async () => (await supabase.from("employee_certifications").select("*, certifications(name), employees(first_name,last_name)")).data ?? [] });

  const [openC, setOpenC] = useState(false);
  const [openCert, setOpenCert] = useState(false);
  const [course, setCourse] = useState({ name: "", provider: "", compliance_framework: "" });
  const [cert, setCert] = useState({ name: "", issuer: "", validity_months: "12", compliance_framework: "" });

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
      <Tabs defaultValue="expiry">
        <TabsList>
          <TabsTrigger value="expiry">Cert Expiry</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="certs">Certification Types</TabsTrigger>
        </TabsList>
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