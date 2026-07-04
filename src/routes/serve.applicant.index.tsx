import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LogIn, LogOut, XCircle, Save } from "lucide-react";
import { VolunteerPublicHeader } from "@/components/volunteer-public-header";

export const Route = createFileRoute("/serve/applicant/")({
  head: () => ({ meta: [{ title: "My volunteer shifts" }] }),
  component: ApplicantPortal,
});

type Signup = {
  id: string; applicant_first_name: string; applicant_last_name: string;
  applicant_email: string | null; applicant_phone: string | null; status: string;
  shift: { id: string; starts_at: string; ends_at: string; location: string | null; volunteer_jobs: { title: string } | null } | null;
};
type OpenEvent = { id: string; signup_id: string; clock_in: string };
type Me = { ok: true; identity: { last_name: string; email: string | null }; signups: Signup[]; open_events: OpenEvent[] } | { ok: false; error: string };

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/public/applicant-portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function ApplicantPortal() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = (await call({ op: "me" })) as Me;
    if (!j.ok) { navigate({ to: "/serve/applicant/signin" }); return; }
    setMe(j);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  async function signOut() {
    await call({ op: "signout" });
    navigate({ to: "/serve/applicant/signin" });
  }

  async function doClock(signup_id: string, action: "in" | "out") {
    setBusyId(signup_id);
    const j = await call({ op: "clock", signup_id, action });
    setBusyId(null);
    if (!j.ok) return toast.error(j.error);
    toast.success(j.message);
    load();
  }

  async function doCancel(signup_id: string) {
    if (!confirm("Withdraw from this shift?")) return;
    setBusyId(signup_id);
    const j = await call({ op: "cancel", signup_id });
    setBusyId(null);
    if (!j.ok) return toast.error(j.error);
    toast.success("Withdrawn");
    load();
  }

  if (!me) return <div className="min-h-screen bg-background"><VolunteerPublicHeader title="My shifts" /><p className="p-6 text-muted-foreground">Loading…</p></div>;
  if (!me.ok) return null;

  const openBySignup = new Map(me.open_events.map((e) => [e.signup_id, e]));
  const upcoming = me.signups.filter((s) => s.shift && new Date(s.shift.ends_at) >= new Date());
  const past = me.signups.filter((s) => !s.shift || new Date(s.shift.ends_at) < new Date());

  return (
    <div className="min-h-screen bg-background">
      <VolunteerPublicHeader title="My volunteer shifts" subtitle={me.identity.email ?? undefined} />
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
        </div>

        <section className="space-y-3">
          <h2 className="font-serif text-xl">Upcoming</h2>
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming shifts. <Link className="underline" to="/serve/volunteer/jobs">Browse open roles</Link>.</p>}
          {upcoming.map((s) => (
            <SignupCard key={s.id} signup={s} openEvent={openBySignup.get(s.id) ?? null} busy={busyId === s.id}
              onClockIn={() => doClock(s.id, "in")} onClockOut={() => doClock(s.id, "out")} onCancel={() => doCancel(s.id)} />
          ))}
        </section>

        {past.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-serif text-xl">Past</h2>
            {past.map((s) => <SignupCard key={s.id} signup={s} openEvent={null} busy={false} readOnly />)}
          </section>
        )}

        <ContactCard signup={me.signups[0]} onSaved={load} />
      </main>
    </div>
  );
}

function SignupCard({ signup, openEvent, busy, onClockIn, onClockOut, onCancel, readOnly }: {
  signup: Signup; openEvent: OpenEvent | null; busy: boolean;
  onClockIn?: () => void; onClockOut?: () => void; onCancel?: () => void; readOnly?: boolean;
}) {
  const shift = signup.shift;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium truncate">{shift?.volunteer_jobs?.title ?? "Shift"}</h3>
            <StatusBadge status={signup.status} />
            {openEvent && <Badge className="bg-emerald-600 hover:bg-emerald-600">Clocked in</Badge>}
          </div>
          {shift && (
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(shift.starts_at).toLocaleString()} — {new Date(shift.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {shift.location && ` · ${shift.location}`}
            </p>
          )}
        </div>
        {!readOnly && (
          <div className="flex flex-col gap-2 shrink-0">
            {signup.status === "approved" && (openEvent
              ? <Button size="sm" variant="secondary" disabled={busy} onClick={onClockOut}><LogOut className="h-4 w-4 mr-1" />Clock out</Button>
              : <Button size="sm" disabled={busy} onClick={onClockIn}><LogIn className="h-4 w-4 mr-1" />Clock in</Button>)}
            {(signup.status === "pending" || signup.status === "approved") && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}><XCircle className="h-4 w-4 mr-1" />Withdraw</Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "approved" ? "bg-emerald-600 hover:bg-emerald-600"
    : status === "pending" ? "bg-amber-500 hover:bg-amber-500"
    : status === "cancelled" ? "bg-muted text-muted-foreground" : "bg-slate-500 hover:bg-slate-500";
  return <Badge className={cls}>{status}</Badge>;
}

function ContactCard({ signup, onSaved }: { signup: Signup | undefined; onSaved: () => void }) {
  const [email, setEmail] = useState(signup?.applicant_email ?? "");
  const [phone, setPhone] = useState(signup?.applicant_phone ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setEmail(signup?.applicant_email ?? ""); setPhone(signup?.applicant_phone ?? ""); }, [signup?.id, signup?.applicant_email, signup?.applicant_phone]);
  if (!signup) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const j = await call({ op: "contact", signup_id: signup!.id, email: email || null, phone: phone || null });
    setBusy(false);
    if (!j.ok) return toast.error(j.error);
    toast.success("Contact info saved");
    onSaved();
  }

  return (
    <section>
      <h2 className="font-serif text-xl mb-3">Contact info</h2>
      <Card className="p-4">
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Phone</Label><Input maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <Button type="submit" size="sm" disabled={busy}><Save className="h-4 w-4 mr-1" />Save</Button>
          <p className="text-xs text-muted-foreground">Applies to all your signups under this last name.</p>
        </form>
      </Card>
    </section>
  );
}