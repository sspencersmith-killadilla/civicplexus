import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, PanelLeftClose, PanelLeftOpen, Menu, ChevronDown, ChevronRight, Globe, Landmark, HandHeart, Briefcase, ExternalLink, FileText, Clock, Store, Vote, BookOpen, Server } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import markAsset from "@/assets/civicplexus-mark.png.asset.json";
import { MODULE_REGISTRY } from "@/lib/modules";
import { useModuleSettings } from "@/hooks/use-module-settings";
import { ModuleGate } from "@/components/module-gate";
import { DemoTour } from "@/components/demo-tour";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { data } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isEnabled, isModuleEnabled } = useModuleSettings();
  const isHrAdmin = !!data?.is_hr_admin || hasRole(data?.roles, "hr_admin");
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("cp:sidebar:collapsed") === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const raw = window.localStorage.getItem("cp:sidebar:collapsed-groups");
      if (raw) return new Set(JSON.parse(raw));
    } catch { /* ignore */ }
    return new Set<string>();
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cp:sidebar:collapsed", collapsed ? "1" : "0");
      window.localStorage.setItem("cp:sidebar:collapsed-groups", JSON.stringify([...collapsedGroups]));
    }
  }, [collapsed, collapsedGroups]);

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const groups = MODULE_REGISTRY
    .filter((g) => isModuleEnabled(g.key))
    .map((g) => ({
      label: g.label,
      items: g.items.filter(
        (n) =>
          isEnabled(n.key) &&
          (isHrAdmin || !data?.roles?.length || n.roles.some((r) => hasRole(data?.roles, r))),
      ),
    }))
    .filter((g) => g.items.length);

  const publicPortals = [
    { to: "/officials", label: "Officials roster", icon: Landmark },
    { to: "/serve", label: "Serve on a board", icon: HandHeart },
    { to: "/careers", label: "Careers", icon: Briefcase },
    { to: "/serve/apply", label: "Job applications", icon: FileText },
    { to: "/serve/volunteer/jobs", label: "Volunteer roles", icon: HandHeart },
    { to: "/serve/volunteer", label: "Volunteer sign-up", icon: HandHeart },
    { to: "/serve/volunteer/clock", label: "Volunteer clock in/out", icon: Clock },
    { to: "/serve/vendor", label: "Vendor registration", icon: Store },
    { to: "/serve/candidate-filing", label: "Candidate filing", icon: Vote },
    { to: "/api/public/docs/user-guide", label: "User Guide", icon: BookOpen },
    { to: "/api/public/docs/self-hosting", label: "Self-Hosting Guide", icon: Server },
  ];
  const publicOpen = collapsed ? true : !collapsedGroups.has("__public__");

  const sidebarNav = (
    <nav className="flex-1 py-4 space-y-1 overflow-y-auto px-3">
      {groups.map((g) => {
        const open = collapsed ? true : !collapsedGroups.has(g.label);
        const hasActiveChild = g.items.some(
          (n) => pathname === n.to || pathname.startsWith(n.to + "/")
        );
        return (
          <div key={g.label} className={cn("", collapsed ? "space-y-1" : "")}>
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggleGroup(g.label)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-md text-[10px] uppercase tracking-wider transition-colors",
                  hasActiveChild
                    ? "text-sidebar-accent-foreground bg-sidebar-accent/40"
                    : "text-sidebar-foreground/50 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground/70"
                )}
              >
                <span>{g.label}</span>
                {open ? (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
              </button>
            )}
            {open && (
              <div className={cn("space-y-1", collapsed ? "" : "pb-2")}>
                {g.items.map((n) => {
                  const active = pathname === n.to || pathname.startsWith(n.to + "/");
                  const Icon = n.icon;
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      title={collapsed ? n.label : undefined}
                      aria-label={n.label}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center rounded-md text-sm transition-colors",
                        collapsed ? "justify-center py-2 px-1" : "gap-3 py-2 px-3",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{n.label}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className={cn("pt-2 mt-2 border-t border-sidebar-border/60", collapsed ? "space-y-1" : "")}>
        {!collapsed && (
          <button
            type="button"
            onClick={() => toggleGroup("__public__")}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[10px] uppercase tracking-wider text-sidebar-foreground/50 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground/70"
          >
            <span className="flex items-center gap-1.5"><Globe className="h-3 w-3" /> Public portals</span>
            {publicOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
        {publicOpen && (
          <div className={cn("space-y-1", collapsed ? "" : "pb-2")}>
            {publicPortals.map((n) => {
              const Icon = n.icon;
              return (
                <a
                  key={n.to}
                  href={n.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={collapsed ? n.label : undefined}
                  aria-label={n.label}
                  className={cn(
                    "flex items-center rounded-md text-sm transition-colors text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    collapsed ? "justify-center py-2 px-1" : "gap-3 py-2 px-3",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="truncate flex-1">{n.label}</span>
                      <ExternalLink className="h-3 w-3 text-sidebar-foreground/40 shrink-0" />
                    </>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "hidden md:flex flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className={cn("border-b border-sidebar-border flex items-center", collapsed ? "px-2 py-4 justify-center" : "px-5 py-6 justify-between gap-2")}>
          <Link to="/" className="flex items-center gap-2.5 min-w-0" aria-label="CivicPlexus home">
            <img src={markAsset.url} alt="" aria-hidden="true" className="h-8 w-8 object-contain shrink-0" />
            {!collapsed && (
              <span className="font-serif text-lg tracking-tight truncate">CivicPlexus</span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="p-1.5 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
        {collapsed && (
          <div className="px-2 pt-2 flex justify-center">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="p-1.5 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}
        {sidebarNav}
        <div className="p-3 border-t border-sidebar-border">
          {!collapsed && (
            <div className="px-3 py-2 text-xs">
              <p className="font-medium truncate">{data?.profile?.full_name ?? data?.user.email}</p>
              <p className="text-sidebar-foreground/60 truncate">{(data?.roles ?? []).join(", ") || "—"}</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            title={collapsed ? "Sign out" : undefined}
            aria-label="Sign out"
            className={cn(
              "w-full text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              collapsed ? "justify-center px-0" : "justify-start",
            )}
          >
            <LogOut className={cn("h-4 w-4", collapsed ? "" : "mr-2")} />
            {!collapsed && "Sign out"}
          </Button>
        </div>
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 bg-sidebar text-sidebar-foreground w-[260px] sm:w-[300px]">
          <div className="flex flex-col h-full">
            <div className="px-5 py-5 border-b border-sidebar-border flex items-center justify-between gap-2">
              <Link to="/" className="flex items-center gap-2.5 min-w-0" aria-label="CivicPlexus home">
                <img src={markAsset.url} alt="" aria-hidden="true" className="h-8 w-8 object-contain shrink-0" />
                <span className="font-serif text-lg tracking-tight truncate">CivicPlexus</span>
              </Link>
            </div>
            {sidebarNav}
            <div className="p-3 border-t border-sidebar-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                aria-label="Sign out"
                className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </div>
          </div>
        </SheetContent>
        <main className="flex-1 min-w-0">
          <DemoTour />
          {title && (
            <header className="border-b bg-card px-4 md:px-10 py-4 md:py-5 flex items-center gap-3">
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open menu"
                  className="md:hidden p-2 rounded-md text-foreground/70 hover:bg-accent hover:text-accent-foreground"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <h1 className="font-serif text-xl md:text-2xl tracking-tight">{title}</h1>
            </header>
          )}
          {!title && (
            <div className="md:hidden px-4 pt-4">
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open menu"
                  className="p-2 rounded-md text-foreground/70 hover:bg-accent hover:text-accent-foreground"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
            </div>
          )}
          <div className="px-4 md:px-10 py-6">
            <ModuleGate>{children}</ModuleGate>
          </div>
        </main>
      </Sheet>
    </div>
  );
}