import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { HeartHandshake } from "lucide-react";

type Props = { title: string; subtitle?: string };

export function VolunteerPublicHeader({ title, subtitle }: Props) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
        setSignedIn(!!session?.user);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <header className="border-b bg-card">
      <div className="max-w-4xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <HeartHandshake className="h-7 w-7 text-primary mt-1" />
          <div>
            <h1 className="font-serif text-2xl tracking-tight">{title}</h1>
            {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {signedIn ? (
            <>
              <Button asChild size="sm"><Link to="/volunteer">My volunteer portal</Link></Button>
              <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
            </>
          ) : signedIn === false ? (
            <>
              <Button asChild variant="ghost" size="sm"><Link to="/serve/applicant/signin">Applicant sign-in (PIN)</Link></Button>
              <Button asChild variant="ghost" size="sm"><Link to="/auth">Sign in</Link></Button>
              <Button asChild size="sm"><Link to="/auth" search={{ volunteer: 1 }}>Create volunteer account</Link></Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}