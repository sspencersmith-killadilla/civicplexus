import { type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, ListChecks, Briefcase, FileText, LogOut, FileSignature, FolderLock, Server, Bell, BarChart3, Package, GraduationCap, ShieldQuestion, HeartHandshake, ScrollText, DoorOpen, Settings, History, BookOpen, UserPlus, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import markAsset from "@/assets/kyberna-mark.png.asset.json";

const NAV_GROUPS = [
  { label: "Overview", items: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["hr_admin", "hiring_manager", "it_admin", "employee", "candidate"] },
    { to: "/notifications", label: "Notifications", icon: Bell, roles: ["hr_admin", "hiring_manager", "it_admin", "employee", "candidate"] },
    { to: "/preboarding", label: "My Onboarding", icon: FileText, roles: ["candidate", "employee"] },
    { to: "/help", label: "Help & Docs", icon: BookOpen, roles: ["hr_admin", "hiring_manager", "it_admin", "employee", "candidate"] },
  ]},
  { label: "People", items: [
    { to: "/employees", label: "Employees", icon: Users, roles: ["hr_admin", "hiring_manager"] },
    { to: "/positions", label: "Positions", icon: ClipboardList, roles: ["hr_admin", "hiring_manager", "supervisor"] },
    { to: "/hire-requests", label: "Hire Requests", icon: UserPlus, roles: ["hr_admin", "supervisor", "hiring_manager"] },
    { to: "/offboarding", label: "Offboarding", icon: DoorOpen, roles: ["hr_admin"] },
    { to: "/benefits", label: "Benefits", icon: HeartHandshake, roles: ["hr_admin"] },
    { to: "/equipment", label: "Equipment & PPE", icon: Package, roles: ["hr_admin", "hiring_manager"] },
  ]},
  { label: "Workflow", items: [
    { to: "/worker-types", label: "Worker Types", icon: Briefcase, roles: ["hr_admin"] },
    { to: "/templates", label: "Templates", icon: ListChecks, roles: ["hr_admin"] },
    { to: "/forms", label: "Forms Library", icon: FileSignature, roles: ["hr_admin"] },
    { to: "/provisioning", label: "IT Provisioning", icon: Server, roles: ["it_admin", "hr_admin"] },
  ]},
  { label: "Compliance", items: [
    { to: "/training", label: "Training & Certs", icon: GraduationCap, roles: ["hr_admin", "hiring_manager"] },
    { to: "/screenings", label: "Screenings", icon: ShieldQuestion, roles: ["hr_admin"] },
    { to: "/policies", label: "Policies", icon: ScrollText, roles: ["hr_admin", "hiring_manager", "employee", "candidate"] },
    { to: "/documents", label: "Documents", icon: FolderLock, roles: ["hr_admin", "it_admin", "hiring_manager", "employee", "candidate"] },
    { to: "/reports", label: "Reports", icon: BarChart3, roles: ["hr_admin"] },
    { to: "/audit", label: "Audit Log", icon: History, roles: ["hr_admin"] },
  ]},
  { label: "Admin", items: [
    { to: "/settings", label: "Settings", icon: Settings, roles: ["hr_admin"] },
  ]},
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

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => !data?.roles?.length || n.roles.some((r) => hasRole(data?.roles, r as never))),
  })).filter((g) => g.items.length);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-6 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Kyberna home">
            <img src={markAsset.url} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
            <span className="font-serif text-lg tracking-tight">Kyberna</span>
          </Link>
          <p className="mt-1 text-xs text-sidebar-foreground/60">Municipal Onboarding</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="px-3 mb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/40">{g.label}</p>
              <div className="space-y-1">
                {g.items.map((n) => {
                  const active = pathname === n.to || pathname.startsWith(n.to + "/");
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
              </div>
            </div>
          ))}
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