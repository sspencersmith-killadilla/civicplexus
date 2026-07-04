import { createFileRoute, useLoaderData, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { listPublicVolunteerJobs } from "@/lib/volunteer-jobs.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { VolunteerPublicHeader } from "@/components/volunteer-public-header";

export const Route = createFileRoute("/serve/volunteer/jobs/$slug")({
  validateSearch: (s: Record<string, unknown>) => z.object({ shift: z.string().optional() }).parse(s),
  loader: async ({ params }) => {
    const jobs = await listPublicVolunteerJobs();
    return jobs.find((j) => j.slug === params.slug) ?? null;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: (loaderData?.title ?? "Volunteer role") + " — Apply to volunteer" },
      { name: "description", content: loaderData?.description?.slice(0, 155) ?? "Apply to volunteer for this role." },
    ],
  }),
  component: ApplyPage,
  errorComponent: () => <p className="p-6">Unable to load.</p>,
  notFoundComponent: () => <p className="p-6">Not found.</p>,
});

type Shift = { id: string; starts_at: string; ends_at: string; location: string | null; capacity: number; taken: number };
type Job = { id: string; title: string; slug: string; description: string | null; location: string | null; skills_required: string[] | null; shifts: Shift[] };

function ApplyPage() {
  const job = useLoaderData({ from: "/serve/volunteer/jobs/$slug" }) as Job | null;
  const search = useSearch({ from: "/serve/volunteer/jobs/$slug" });
  const [shiftId, setShiftId] = useState<string>(search.shift ?? job?.shifts?.[0]?.id ?? "");
  const [first, setFirst] = useState(""); const [last, setLast] = useState("");
  const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false); const [done, setDone] = useState(false);

  if (!job) return <p className="p-6">Role not found.</p>;
  if (done) return (
    <div className="min-h-screen bg-background">
      <VolunteerPublicHeader title="Volunteer" />
      <div className="flex items-center justify-center p-6">
        <Card className="max-w-md p-8 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600" />
          <h1 className="font-serif text-2xl mt-4">Application submitted.</h1>
          <p className="text-muted-foreground mt-2 text-sm">A coordinator will review and email you an approval and a 4-digit PIN for clock-in.</p>
        </Card>
      </div>
    </div>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/public/volunteer-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shift_id: shiftId, first_name: first, last_name: last, email: email || null, phone: phone || null, message: message || null }),
    });
    const j = await res.json();
    setSubmitting(false);
    if (!j.ok) { toast.error(j.error ?? "Failed"); return; }
    setDone(true);
  }

  return (
    <div className="min-h-screen bg-background">
      <VolunteerPublicHeader title={job.title} subtitle={job.location ?? undefined} />
      {job.description && (
        <div className="max-w-3xl mx-auto px-6 pt-6">
          <p className="text-sm whitespace-pre-wrap">{job.description}</p>
        </div>
      )}
      <main className="max-w-3xl mx-auto px-6 py-8">
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Pick a shift *</Label>
              <select className="w-full border rounded-md h-10 px-3 bg-background" required value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                <option value="">Select…</option>
                {job.shifts.map((s: Shift) => (
                  <option key={s.id} value={s.id} disabled={s.taken >= s.capacity}>
                    {new Date(s.starts_at).toLocaleString()} — {new Date(s.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ({s.taken}/{s.capacity})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First name *</Label><Input required value={first} onChange={(e) => setFirst(e.target.value)} /></div>
              <div><Label>Last name *</Label><Input required value={last} onChange={(e) => setLast(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </div>
            <div><Label>Message (optional)</Label><Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
            <Button type="submit" disabled={submitting || !first || !last || !shiftId}>{submitting ? "Submitting…" : "Apply for this shift"}</Button>
          </form>
        </Card>
      </main>
    </div>
  );
}