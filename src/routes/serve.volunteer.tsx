import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { HeartHandshake, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/serve/volunteer")({
  head: () => ({
    meta: [
      { title: "Volunteer with the city" },
      { name: "description", content: "Sign up to volunteer for civic service projects, events, and programs." },
    ],
  }),
  component: VolunteerIntake,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function VolunteerIntake() {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [skills, setSkills] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await sb.from("volunteers").insert({
      first_name: first, last_name: last,
      email: email || null, phone: phone || null,
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      notes: notes || null, status: "pending",
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md p-8 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600" />
          <h1 className="font-serif text-2xl mt-4">Thanks for stepping up.</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            We've received your volunteer application. A coordinator will reach out with
            waiver and background-check next steps.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-10 flex items-start gap-4">
          <HeartHandshake className="h-8 w-8 text-primary" />
          <div>
            <h1 className="font-serif text-3xl tracking-tight">Volunteer with the city</h1>
            <p className="text-muted-foreground mt-2">
              Share your interests — we'll match you with the right program, event, or project.
            </p>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First name *</Label><Input required value={first} onChange={(e) => setFirst(e.target.value)} /></div>
              <div><Label>Last name *</Label><Input required value={last} onChange={(e) => setLast(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </div>
            <div>
              <Label>Skills / interests</Label>
              <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="first aid, event setup, tutoring" />
              <p className="text-xs text-muted-foreground mt-1">Comma-separated.</p>
            </div>
            <div>
              <Label>Anything else?</Label>
              <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Availability, preferred programs, accessibility needs, etc." />
            </div>
            <Button disabled={submitting || !first || !last} type="submit">
              {submitting ? "Submitting…" : "Submit application"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}