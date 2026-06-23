import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useModuleSettings } from "@/hooks/use-module-settings";
import { featureKeyForPath } from "@/lib/modules";
import { Button } from "@/components/ui/button";

/**
 * Wrap protected page bodies. When the current route's feature (or its
 * parent module) is disabled in module_settings, render a "module off"
 * notice instead of children.
 */
export function ModuleGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isEnabled, isLoading } = useModuleSettings();
  const key = featureKeyForPath(pathname);

  if (isLoading) return <>{children}</>;
  if (!key || isEnabled(key)) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4 rounded-lg border bg-card p-8 shadow-sm">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="font-serif text-xl">Module turned off</h2>
        <p className="text-sm text-muted-foreground">
          This area has been disabled by your administrator. Contact HR if you
          believe you should have access.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}