import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { HeartHandshake } from "lucide-react";

export const Route = createFileRoute("/_authenticated/volunteer")({
  head: () => ({ meta: [{ title: "Volunteer portal" }] }),
  component: VolunteerLayout,
});

function VolunteerLayout() {
  const loc = useLocation();
  const tab = (to: string, label: string) => {
    const active = loc.pathname === to || (to !== "/volunteer" && loc.pathname.startsWith(to));
    return (
      <Link
        to={to}
        className={`px-3 py-2 text-sm rounded-md ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        {label}
      </Link>
    );
  };
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center gap-3">
          <HeartHandshake className="h-7 w-7 text-primary" />
          <div>
            <h1 className="font-serif text-2xl tracking-tight">Volunteer portal</h1>
            <p className="text-xs text-muted-foreground">Manage your profile, register for shifts, and clock in.</p>
          </div>
        </div>
        <nav className="max-w-4xl mx-auto px-6 pb-3 flex gap-2">
          {tab("/volunteer", "My shifts")}
          {tab("/volunteer/find", "Browse opportunities")}
          {tab("/volunteer/profile", "Profile")}
        </nav>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}