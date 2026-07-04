import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { VolunteerPublicHeader } from "@/components/volunteer-public-header";

export const Route = createFileRoute("/serve/applicant/signin")({
  head: () => ({
    meta: [
      { title: "Volunteer applicant sign-in" },
      { name: "description", content: "Sign in with your last name and coordinator-issued PIN to manage your shifts." },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const [last, setLast] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/public/applicant-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "signin", last_name: last.trim(), pin: pin.trim() }),
      });
      const j = await res.json();
      if (!j.ok) { toast.error(j.error ?? "Sign-in failed"); return; }
      navigate({ to: "/serve/applicant" });
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-background">
      <VolunteerPublicHeader title="Applicant sign-in" subtitle="Use the 4-digit PIN your coordinator emailed you." />
      <main className="max-w-md mx-auto px-6 py-10">
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Last name</Label>
              <Input required autoFocus autoComplete="family-name" maxLength={80} value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
            <div>
              <Label>PIN</Label>
              <Input required inputMode="numeric" pattern="[0-9]*" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !last || !pin}>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
          <p className="text-xs text-muted-foreground mt-4">
            No PIN yet? Your coordinator issues one after approving your shift signup. You can still <Link className="underline" to="/serve/volunteer/jobs">browse open roles</Link>.
          </p>
        </Card>
      </main>
    </div>
  );
}