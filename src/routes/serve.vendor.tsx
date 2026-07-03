import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Briefcase, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/serve/vendor")({
  head: () => ({
    meta: [
      { title: "Vendor & contractor registration" },
      { name: "description", content: "Register your business to be considered for city contracts and procurement opportunities." },
    ],
  }),
  component: VendorIntake,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function VendorIntake() {
  const [legal, setLegal] = useState("");
  const [dba, setDba] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [services, setServices] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await sb.from("vendors").insert({
      legal_name: legal, dba: dba || null,
      contact_name: name || null, contact_email: email || null, contact_phone: phone || null,
      status: "pending", notes: services || null,
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
          <h1 className="font-serif text-2xl mt-4">Registration received.</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Procurement will follow up for W-9 and Certificate of Insurance uploads.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-10 flex items-start gap-4">
          <Briefcase className="h-8 w-8 text-primary" />
          <div>
            <h1 className="font-serif text-3xl tracking-tight">Vendor & contractor registration</h1>
            <p className="text-muted-foreground mt-2">
              Register your business to be considered for city contracts and procurement opportunities.
            </p>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Legal business name *</Label><Input required value={legal} onChange={(e) => setLegal(e.target.value)} /></div>
              <div><Label>DBA</Label><Input value={dba} onChange={(e) => setDba(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Contact name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </div>
            <div>
              <Label>Services offered</Label>
              <Textarea rows={4} value={services} onChange={(e) => setServices(e.target.value)} placeholder="Landscaping, IT consulting, construction, etc." />
            </div>
            <Button type="submit" disabled={submitting || !legal}>
              {submitting ? "Submitting…" : "Submit registration"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}