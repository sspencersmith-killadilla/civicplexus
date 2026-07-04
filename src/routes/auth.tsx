import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import markAsset from "@/assets/civicplexus-mark.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — CivicPlexus" }, { name: "description", content: "Sign in or create your CivicPlexus account." }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    volunteer: search.volunteer === 1 || search.volunteer === "1" || search.volunteer === true ? 1 : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" }) as { volunteer?: 1 };
  const volunteerIntent = search.volunteer === 1;
  const [mode, setMode] = useState<"signin" | "signup">(volunteerIntent ? "signup" : "signin");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [asVolunteer, setAsVolunteer] = useState(volunteerIntent);

  async function routeAfterAuth(userId: string) {
    // Staff (any role) → staff dashboard. Otherwise → volunteer portal if they have or want a volunteer profile.
    const [{ data: roles }, { data: vol }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).limit(1),
      supabase.from("volunteers").select("id").eq("user_id", userId).limit(1),
    ]);
    const hasStaffRole = (roles ?? []).length > 0;
    const isVolunteer = (vol ?? []).length > 0 || asVolunteer;
    if (!hasStaffRole && isVolunteer) {
      navigate({ to: "/volunteer", replace: true });
    } else {
      navigate({ to: "/dashboard", replace: true });
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) routeAfterAuth(data.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data: signup, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + (asVolunteer ? "/volunteer" : "/dashboard"),
            data: { full_name: fullName, kind: asVolunteer ? "volunteer" : "staff" },
          },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
        if (signup.user && asVolunteer) {
          navigate({ to: "/volunteer/profile", replace: true });
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data: u } = await supabase.auth.getUser();
      if (u.user) await routeAfterAuth(u.user.id);
      else navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + (asVolunteer ? "/volunteer" : "/dashboard") });
    if (result.error) {
      toast.error("Google sign-in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    const { data: u } = await supabase.auth.getUser();
    if (u.user) await routeAfterAuth(u.user.id);
    else navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex flex-col justify-between p-10 bg-sidebar text-sidebar-foreground">
        <Link to="/" className="flex items-center gap-2.5" aria-label="CivicPlexus home">
          <img src={markAsset.url} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
          <span className="font-serif text-xl tracking-tight">CivicPlexus</span>
        </Link>
        <div>
          <p className="font-serif text-3xl leading-tight max-w-md">"Every new hire ready on day zero — from City Hall to the water plant."</p>
          <p className="mt-4 text-sm text-sidebar-foreground/60">Municipal HR Suite</p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">© {new Date().getFullYear()} CivicPlexus</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h1 className="font-serif text-3xl tracking-tight">Welcome</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue your onboarding, or create an account to get started.</p>

          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="mt-6">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <form onSubmit={onEmail} className="mt-6 space-y-4">
              <TabsContent value="signup" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required={mode === "signup"} />
                </div>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={asVolunteer} onChange={(e) => setAsVolunteer(e.target.checked)} />
                  <span>
                    I'm signing up as a <strong>volunteer</strong> to register for shifts.
                    <span className="block text-xs text-muted-foreground">Staff members should leave this unchecked.</span>
                  </span>
                </label>
              </TabsContent>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
              </Button>
            </form>
          </Tabs>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px bg-border flex-1" /> OR <div className="h-px bg-border flex-1" />
          </div>
          <Button onClick={onGoogle} variant="outline" disabled={loading} className="w-full">
            Continue with Google
          </Button>
        </div>
      </div>
    </div>
  );
}