import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { getPublicRequisition } from "@/lib/jobs.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const jobQuery = (slug: string) => queryOptions({
  queryKey: ["public-careers", slug],
  queryFn: () => getPublicRequisition({ data: { slug } }),
});

export const Route = createFileRoute("/careers/$slug/apply")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(jobQuery(params.slug)),
  errorComponent: ({ error }) => <p className="p-8 text-sm">{error.message}</p>,
  notFoundComponent: () => <p className="p-8 text-sm">Position not found.</p>,
  pendingComponent: () => (
    <div className="min-h-screen bg-background">
      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="h-4 w-24 bg-muted rounded animate-pulse mb-6" />
        <div className="h-8 w-2/3 bg-muted rounded animate-pulse mb-2" />
        <div className="h-4 w-1/2 bg-muted rounded animate-pulse mb-8" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </main>
    </div>
  ),
  component: ApplyPage,
});

function ApplyPage() {
  const { slug } = Route.useParams();
  const { data: j } = useSuspenseQuery(jobQuery(slug));
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", cover_letter: "" });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [honey, setHoney] = useState("");
  const [selfId, setSelfId] = useState({ gender: "", race_ethnicity: "", veteran_status: "", disability_status: "", declined: false });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (honey) return; // bot trap
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("requisition_id", j.id);
      fd.append("applicant_name", form.name);
      fd.append("email", form.email);
      fd.append("phone", form.phone);
      fd.append("cover_letter", form.cover_letter);
      if (file) fd.append("resume", file);
      if (selfId.declined || selfId.gender || selfId.race_ethnicity || selfId.veteran_status || selfId.disability_status) {
        fd.append("self_id", JSON.stringify(selfId));
      }
      const res = await fetch("/api/public/job-applications", { method: "POST", body: fd });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Submission failed");
      }
      toast.success("Application submitted!");
      nav({ to: "/careers" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-2xl mx-auto px-6 py-10">
        <Link to="/careers/$slug" params={{ slug }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to position
        </Link>
        <h1 className="font-serif text-2xl tracking-tight mb-1">Apply: {j.title}</h1>
        <p className="text-sm text-muted-foreground mb-6">We'll be in touch soon after we review your application.</p>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <input type="text" name="website" value={honey} onChange={(e)=>setHoney(e.target.value)} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Full name *</Label><Input required value={form.name} onChange={(e)=>setForm({...form, name: e.target.value})} /></div>
              <div><Label>Email *</Label><Input required type="email" value={form.email} onChange={(e)=>setForm({...form, email: e.target.value})} /></div>
            </div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e)=>setForm({...form, phone: e.target.value})} /></div>
            <div><Label>Resume (PDF, DOC, DOCX)</Label><Input type="file" accept=".pdf,.doc,.docx" onChange={(e)=>setFile(e.target.files?.[0] ?? null)} /></div>
            <div><Label>Cover letter</Label><Textarea rows={6} value={form.cover_letter} onChange={(e)=>setForm({...form, cover_letter: e.target.value})} /></div>

            <details className="border rounded p-4 bg-secondary/30">
              <summary className="text-sm font-medium cursor-pointer">Voluntary self-identification (optional, EEO-4)</summary>
              <p className="text-xs text-muted-foreground mt-2 mb-3">
                As an Equal Opportunity Employer, we invite you to voluntarily self-identify. This information is kept confidential, will not be visible to hiring managers, and is used only for aggregate compliance reporting. Submission is optional and refusal will not subject you to any adverse treatment.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div><Label>Gender</Label>
                  <select className="w-full border rounded h-9 px-2 bg-background" value={selfId.gender} onChange={(e) => setSelfId({ ...selfId, gender: e.target.value })}>
                    <option value="">—</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option>
                  </select>
                </div>
                <div><Label>Race / Ethnicity</Label>
                  <select className="w-full border rounded h-9 px-2 bg-background" value={selfId.race_ethnicity} onChange={(e) => setSelfId({ ...selfId, race_ethnicity: e.target.value })}>
                    <option value="">—</option><option>Hispanic or Latino</option><option>White</option><option>Black or African American</option>
                    <option>Asian</option><option>Native Hawaiian or Pacific Islander</option><option>American Indian or Alaska Native</option>
                    <option>Two or more races</option><option>Prefer not to say</option>
                  </select>
                </div>
                <div><Label>Veteran status</Label>
                  <select className="w-full border rounded h-9 px-2 bg-background" value={selfId.veteran_status} onChange={(e) => setSelfId({ ...selfId, veteran_status: e.target.value })}>
                    <option value="">—</option><option>Protected veteran</option><option>Not a protected veteran</option><option>Prefer not to say</option>
                  </select>
                </div>
                <div><Label>Disability status</Label>
                  <select className="w-full border rounded h-9 px-2 bg-background" value={selfId.disability_status} onChange={(e) => setSelfId({ ...selfId, disability_status: e.target.value })}>
                    <option value="">—</option><option>Yes, I have a disability</option><option>No, I do not have a disability</option><option>Prefer not to say</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 mt-3 text-sm">
                <input type="checkbox" checked={selfId.declined} onChange={(e) => setSelfId({ ...selfId, declined: e.target.checked })} /> I decline to self-identify
              </label>
            </details>

            <div className="flex justify-end">
              <Button type="submit" size="lg" disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}