import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, PanelLeftClose, PanelLeftOpen, Menu } from "lucide-react";
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
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { data } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isEnabled, isModuleEnabled } = useModuleSettings();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("cp:sidebar:collapsed") === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cp:sidebar:collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

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
          (!data?.roles?.length || n.roles.some((r) => hasRole(data?.roles, r))),
      ),
    }))
    .filter((g) => g.items.length);

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
        <nav className={cn("flex-1 py-4 space-y-5 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
          {groups.map((g) => (
            <div key={g.label}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/40">{g.label}</p>
              )}
              <div className="space-y-1">
                {g.items.map((n) => {
                  const active = pathname === n.to || pathname.startsWith(n.to + "/");
                  const Icon = n.icon;
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      title={collapsed ? n.label : undefined}
                      aria-label={collapsed ? n.label : undefined}
                      className={cn(
                        "flex items-center gap-3 py-2 rounded-md text-sm transition-colors",
                        collapsed ? "px-2 justify-center" : "px-3",
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
            </div>
          ))}
        </nav>
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
      <main className="flex-1 min-w-0">
        <DemoTour />
        {title && (
          <header className="border-b bg-card px-6 md:px-10 py-5">
            <h1 className="font-serif text-2xl tracking-tight">{title}</h1>
          </header>
        )}
        <div className="px-6 md:px-10 py-6">
          <ModuleGate>{children}</ModuleGate>
        </div>
      </main>
    </div>
  );
}