import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarClock, ClipboardList, LogIn, UserPlus } from "lucide-react";
import { VolunteerPublicHeader } from "@/components/volunteer-public-header";

export const Route = createFileRoute("/serve/volunteer")({
  head: () => ({
    meta: [
      { title: "Volunteer with the city" },
      { name: "description", content: "Sign up to volunteer for civic service projects, events, and programs." },
    ],
  }),
  component: VolunteerLanding,
});

function VolunteerLanding() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/volunteer", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <VolunteerPublicHeader
        title="Volunteer with the city"
        subtitle="Create an account to register for shifts, track your hours, and clock in."
      />
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <Card className="p-8">
          <h2 className="font-serif text-2xl tracking-tight">Get started</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl">
            Volunteers now have their own accounts. Sign up once, then browse open roles,
            register for the shifts that work for you, and clock in / out right from your portal.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ volunteer: 1 }}><UserPlus className="h-4 w-4 mr-2" /> Create volunteer account</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/auth"><LogIn className="h-4 w-4 mr-2" /> Sign in</Link>
            </Button>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-6">
            <ClipboardList className="h-6 w-6 text-primary" />
            <h3 className="font-medium mt-3">Browse opportunities</h3>
            <p className="text-sm text-muted-foreground mt-1">See the roles and shifts open right now — no account required to look.</p>
            <Button asChild variant="link" className="px-0 mt-2"><Link to="/serve/volunteer/jobs">Open roles →</Link></Button>
          </Card>
          <Card className="p-6">
            <CalendarClock className="h-6 w-6 text-primary" />
            <h3 className="font-medium mt-3">Already approved?</h3>
            <p className="text-sm text-muted-foreground mt-1">Sign in to clock in and out, or use the shared kiosk with your last name and PIN.</p>
            <Button asChild variant="link" className="px-0 mt-2"><Link to="/serve/volunteer/clock">Kiosk clock →</Link></Button>
          </Card>
        </div>
      </main>
    </div>
  );
}