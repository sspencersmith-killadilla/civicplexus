import { type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, ListChecks, Briefcase, FileText, LogOut, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["hr_admin", "hiring_manager", "it_admin", "employee", "candidate"] },
  { to: "/employees", label: "Employees", icon: Users, roles: ["hr_admin", "hiring_manager"] },
  { to: "/worker-types", label: "Worker Types", icon: Briefcase, roles: ["hr_admin"] },
  { to: "/templates", label: "Templates", icon: ListChecks, roles: ["hr_admin"] },
  { to: "/preboarding", label: "My Onboarding", icon: FileText, roles: ["candidate", "employee"] },
] as const;

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { data } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const items = NAV.filter((n) => !data?.roles?.length || n.roles.some((r) => hasRole(data?.roles, r as never)));

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-6 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-sidebar-primary" />
            <span className="font-serif text-lg tracking-tight">Civitas</span>
          </Link>
          <p className="mt-1 text-xs text-sidebar-foreground/60">Municipal Onboarding</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((n) => {
            const active = pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 text-xs">
            <p className="font-medium truncate">{data?.profile?.full_name ?? data?.user.email}</p>
            <p className="text-sidebar-foreground/60 truncate">{(data?.roles ?? []).join(", ") || "—"}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        {title && (
          <header className="border-b bg-card px-6 md:px-10 py-5">
            <h1 className="font-serif text-2xl tracking-tight">{title}</h1>
          </header>
        )}
        <div className="px-6 md:px-10 py-6">{children}</div>
      </main>
    </div>
  );
}