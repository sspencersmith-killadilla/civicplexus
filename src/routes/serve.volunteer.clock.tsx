import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Clock, LogIn, LogOut } from "lucide-react";

export const Route = createFileRoute("/serve/volunteer/clock")({
  head: () => ({
    meta: [
      { title: "Volunteer clock in / out" },
      { name: "description", content: "Approved volunteers can clock in and out for their shift." },
    ],
  }),
  component: ClockPortal,
});

type Signup = {
  id: string; applicant_first_name: string; applicant_last_name: string;
  shift: { starts_at: string; ends_at: string; location: string | null; volunteer_jobs: { title: string } | null } | null;
};

function ClockPortal() {
  const [last, setLast] = useState(""); const [pin, setPin] = useState("");
  const [signup, setSignup] = useState<Signup | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const res = await fetch("/api/public/volunteer-clock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "lookup", pin, last_name: last }) });
    const j = await res.json(); setBusy(false);
    if (!j.ok) { toast.error(j.error ?? "Not found"); return; }
    setSignup(j.signup); setOpenId(j.open?.id ?? null);
  }

  async function act(action: "in" | "out") {
    if (!signup) return;
    setBusy(true);
    const res = await fetch("/api/public/volunteer-clock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "action", signup_id: signup.id, pin, action }) });
    const j = await res.json(); setBusy(false);
    if (!j.ok) { toast.error(j.error ?? "Failed"); return; }
    toast.success(j.message);
    setOpenId(action === "in" ? "new" : null);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-xl mx-auto px-6 py-8 flex items-center gap-3">
          <Clock className="h-7 w-7 text-primary" />
          <div>
            <h1 className="font-serif text-2xl tracking-tight">Volunteer clock in / out</h1>
            <p className="text-muted-foreground text-sm">Enter your last name and PIN you received in your approval email.</p>
          </div>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-6 py-8">
        {!signup ? (
          <Card className="p-6">
            <form onSubmit={lookup} className="space-y-3">
              <div><Label>Last name</Label><Input required value={last} onChange={(e) => setLast(e.target.value)} /></div>
              <div><Label>4-digit PIN</Label><Input required inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} /></div>
              <Button type="submit" disabled={busy}>{busy ? "Checking…" : "Find my shift"}</Button>
            </form>
          </Card>
        ) : (
          <Card className="p-6 space-y-4">
            <div>
              <h2 className="font-medium">{signup.applicant_first_name} {signup.applicant_last_name}</h2>
              <p className="text-sm text-muted-foreground">{signup.shift?.volunteer_jobs?.title}</p>
              {signup.shift && <p className="text-xs text-muted-foreground">{new Date(signup.shift.starts_at).toLocaleString()} – {new Date(signup.shift.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {signup.shift.location ?? "—"}</p>}
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy || !!openId} onClick={() => act("in")}><LogIn className="h-4 w-4 mr-2" /> Clock in</Button>
              <Button className="flex-1" variant="secondary" disabled={busy || !openId} onClick={() => act("out")}><LogOut className="h-4 w-4 mr-2" /> Clock out</Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSignup(null); setPin(""); setLast(""); setOpenId(null); }}>Done</Button>
          </Card>
        )}
      </main>
    </div>
  );
}