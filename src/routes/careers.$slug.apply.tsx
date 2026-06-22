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
            <div className="flex justify-end">
              <Button type="submit" size="lg" disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}