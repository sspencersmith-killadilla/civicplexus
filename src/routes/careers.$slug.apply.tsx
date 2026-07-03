import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getPublicRequisition } from "@/lib/jobs.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getActiveApplicationTemplate, listSupplementalQuestions } from "@/lib/application-templates.functions";

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
  const [ready, setReady] = useState(false);
  const [honey, setHoney] = useState("");
  const [selfId, setSelfId] = useState({ gender: "", race_ethnicity: "", veteran_status: "", disability_status: "", declined: false });
  const [template, setTemplate] = useState<any>(null);
  const [supplementals, setSupplementals] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [suppAnswers, setSuppAnswers] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState<{ id: string; portal_path: string; portal_url: string; portal_expires_at: string } | null>(null);

  const tplFn = useServerFn(getActiveApplicationTemplate);
  const suppFn = useServerFn(listSupplementalQuestions);

  useEffect(() => {
    setReady(true);
    tplFn().then((t) => setTemplate(t)).catch(() => {});
    suppFn({ data: { requisition_id: j.id } }).then((rows) => setSupplementals(rows ?? [])).catch(() => {});
  }, [j.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (honey) return; // bot trap
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    // Required base template fields
    for (const s of (template?.schema?.sections ?? [])) {
      for (const f of (s.fields ?? [])) {
        if (f.required && (answers[f.key] === undefined || answers[f.key] === "" || answers[f.key] === null)) {
          toast.error(`Missing required field: ${f.label}`);
          return;
        }
      }
    }
    // Required supplementals
    for (const q of supplementals) {
      if (q.required && (suppAnswers[q.key] === undefined || suppAnswers[q.key] === "" || suppAnswers[q.key] === null)) {
        toast.error(`Please answer: ${q.label}`);
        return;
      }
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
      if (Object.keys(answers).length) fd.append("answers", JSON.stringify(answers));
      if (Object.keys(suppAnswers).length) fd.append("supplemental_answers", JSON.stringify(suppAnswers));
      if (selfId.declined || selfId.gender || selfId.race_ethnicity || selfId.veteran_status || selfId.disability_status) {
        fd.append("self_id", JSON.stringify(selfId));
      }
      const res = await fetch("/api/public/job-applications", { method: "POST", body: fd });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Submission failed");
      }
      const payload = await res.json() as { id: string; portal_path?: string; portal_url?: string; portal_expires_at?: string };
      toast.success("Application submitted!");
      if (payload.portal_path && payload.portal_url && payload.portal_expires_at) {
        setSubmitted({ id: payload.id, portal_path: payload.portal_path, portal_url: payload.portal_url, portal_expires_at: payload.portal_expires_at });
      } else {
        nav({ to: "/careers" });
      }
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
        {submitted ? (
          <Card className="p-8 text-center space-y-5">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-serif text-2xl tracking-tight">Application received</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Your candidate portal is ready. Use it to track your application status, see interview updates, review offers, and message the recruiting team.
              </p>
            </div>
            <div className="rounded-lg border bg-secondary/30 p-4 text-left">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Portal link</p>
              <p className="text-sm font-medium break-all mt-1">{submitted.portal_url}</p>
              <p className="text-xs text-muted-foreground mt-2">This secure link expires {new Date(submitted.portal_expires_at).toLocaleDateString()}.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button asChild size="lg">
                <Link to="/candidate/$token" params={{ token: submitted.portal_path.replace("/candidate/", "") }}>
                  Open candidate portal <ExternalLink className="h-4 w-4 ml-2" />
                </Link>
              </Button>
              <Button variant="outline" onClick={() => navigator.clipboard?.writeText(submitted.portal_url).then(() => toast.success("Portal link copied")).catch(() => toast.error("Could not copy link"))}>
                Copy link
              </Button>
            </div>
          </Card>
        ) : (
        <>
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

            {template?.schema?.sections?.map((s: any, si: number) => (
              <section key={si} className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-semibold">{s.title}</h3>
                {(s.fields ?? []).map((f: any) => (
                  <DynamicField
                    key={f.key}
                    field={f}
                    value={answers[f.key]}
                    onChange={(v: any) => setAnswers((a) => ({ ...a, [f.key]: v }))}
                  />
                ))}
              </section>
            ))}

            {supplementals.length > 0 && (
              <section className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-semibold">Supplemental questions</h3>
                {supplementals.map((q) => (
                  <DynamicField
                    key={q.key}
                    field={q}
                    value={suppAnswers[q.key]}
                    onChange={(v: any) => setSuppAnswers((a) => ({ ...a, [q.key]: v }))}
                  />
                ))}
              </section>
            )}

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
              <Button type="submit" size="lg" disabled={!ready || submitting}>{!ready ? "Loading…" : submitting ? "Submitting…" : "Submit application"}</Button>
            </div>
          </form>
        </Card>
        </>
        )}
      </main>
    </div>
  );
}

function DynamicField({ field, value, onChange }: { field: any; value: any; onChange: (v: any) => void }) {
  const v = value ?? "";
  const opts: Array<{ value: string; label: string }> = field.options ?? [];
  return (
    <div>
      <Label>{field.label}{field.required && " *"}</Label>
      {field.type === "textarea" ? (
        <Textarea value={v} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "boolean" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> Yes
        </label>
      ) : field.type === "select" ? (
        <select className="w-full border rounded h-9 px-2 bg-background" value={v} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <Input
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
          value={v}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}