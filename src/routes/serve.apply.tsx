import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBodiesAcceptingApplications } from "@/lib/board-applications.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/serve/apply")({
  head: () => ({ meta: [{ title: "Apply to serve on a board" }] }),
  component: ApplyPage,
});

function ApplyPage() {
  const listFn = useServerFn(listBodiesAcceptingApplications);
  const bodiesQ = useQuery({ queryKey: ["public-serve-bodies"], queryFn: () => listFn() });
  const bodies = bodiesQ.data ?? [];

  const [interests, setInterests] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ status_url: string } | null>(null);

  function toggle(id: string) {
    setInterests((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!next.includes(primary)) setPrimary(next[0] ?? "");
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (interests.length === 0) { toast.error("Select at least one board"); return; }
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("interests", JSON.stringify(interests.map((body_id) => ({ body_id }))));
      fd.set("primary_body_id", primary || interests[0]);
      const res = await fetch("/api/public/board-applications", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submit failed");
      setDone({ status_url: json.status_url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 max-w-lg text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-primary mb-3" />
          <h1 className="font-serif text-2xl">Application received</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Thank you for your interest in serving. The City Clerk's office will review your
            application and follow up by email.
          </p>
          {done.status_url && (
            <p className="text-xs text-muted-foreground mt-4 break-all">
              Save this link to check status: <a href={done.status_url} className="underline">{done.status_url}</a>
            </p>
          )}
          <div className="mt-6"><Link to="/serve"><Button variant="outline" size="sm">Back to boards</Button></Link></div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link to="/serve" className="text-xs text-muted-foreground hover:text-foreground">← Boards</Link>
          <h1 className="font-serif text-3xl tracking-tight mt-2">Application to serve</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Choose the boards you'd like to be considered for and mark your primary interest.
          </p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <form onSubmit={onSubmit} className="space-y-8" encType="multipart/form-data">
          <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hidden" />

          <section className="space-y-3">
            <h2 className="font-medium">Boards of interest</h2>
            {bodies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No boards are currently accepting applications.</p>
            ) : (
              <div className="space-y-2">
                {bodies.map((b) => (
                  <label key={b.id} className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={interests.includes(b.id)} onCheckedChange={() => toggle(b.id)} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{b.name}</p>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">{b.kind}</p>
                      {b.meeting_cadence && <p className="text-xs text-muted-foreground mt-1">Meets: {b.meeting_cadence}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>

          {interests.length > 1 && (
            <section className="space-y-2">
              <h2 className="font-medium">Primary interest</h2>
              <RadioGroup value={primary} onValueChange={setPrimary}>
                {interests.map((id) => {
                  const b = bodies.find((x) => x.id === id);
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <RadioGroupItem value={id} id={`p-${id}`} />
                      <Label htmlFor={`p-${id}`} className="text-sm">{b?.name ?? id}</Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </section>
          )}

          <section className="space-y-4">
            <h2 className="font-medium">Your information</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>First name *</Label><Input name="first_name" required maxLength={100} /></div>
              <div><Label>Last name *</Label><Input name="last_name" required maxLength={100} /></div>
              <div><Label>Email *</Label><Input name="email" type="email" required maxLength={200} /></div>
              <div><Label>Phone</Label><Input name="phone" maxLength={40} /></div>
              <div className="sm:col-span-2"><Label>Address</Label><Input name="address" maxLength={300} /></div>
              <div><Label>City</Label><Input name="city" maxLength={100} /></div>
              <div><Label>State</Label><Input name="state" maxLength={50} /></div>
              <div><Label>Postal code</Label><Input name="postal_code" maxLength={20} /></div>
              <div><Label>Employer</Label><Input name="employer" maxLength={200} /></div>
              <div><Label>Occupation</Label><Input name="occupation" maxLength={200} /></div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-medium">Why do you want to serve?</h2>
            <div>
              <Label>Statement of interest</Label>
              <Textarea name="statement" rows={5} maxLength={6000} />
            </div>
            <div>
              <Label>Relevant qualifications, experience, or education</Label>
              <Textarea name="qualifications" rows={4} maxLength={4000} />
            </div>
            <div>
              <Label>Conflicts of interest to disclose</Label>
              <Textarea name="conflicts_disclosure" rows={3} maxLength={2000} placeholder="If none, leave blank." />
            </div>
            <div>
              <Label>Cover letter (PDF or Word, optional)</Label>
              <Input type="file" name="cover_letter" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Link to="/serve"><Button type="button" variant="outline">Cancel</Button></Link>
            <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button>
          </div>
        </form>
      </main>
    </div>
  );
}