import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Briefcase, Users, Video, FileSignature, UserPlus, ClipboardCheck, MessagesSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hiring")({ component: HiringLayout });

const NAV = [
  { to: "/jobs", label: "Requisitions", icon: Briefcase },
  { to: "/jobs", label: "Applications", icon: Users },
  { to: "/interviews", label: "Interviews", icon: MessagesSquare },
  { to: "/hiring/interview-kits", label: "Interview Kits", icon: Video },
  { to: "/offers", label: "Offers", icon: FileSignature },
  { to: "/hire-requests", label: "Hire Requests", icon: UserPlus },
  { to: "/screenings", label: "Screenings", icon: ClipboardCheck },
];

function HiringLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <AppShell title="Hiring">
      <div className="grid md:grid-cols-[220px_1fr] gap-6">
        <Card className="p-2 h-fit sticky top-4 self-start">
          <nav className="space-y-0.5">
            {NAV.map((n) => {
              const active = n.label !== "Applications" && (pathname === n.to || pathname.startsWith(n.to + "/"));
              const Icon = n.icon;
              return (
                <Link
                  key={n.label}
                  to={n.to}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{n.label}</span>
                </Link>
              );
            })}
          </nav>
        </Card>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}