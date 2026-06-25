import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, X, ChevronLeft, ChevronRight, RotateCcw, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { TOUR_STOPS, DEMO_EMAIL } from "@/lib/demo-tour";
import { getDemoStatus, resetDemoAccount } from "@/lib/demo-account.functions";

const DISMISS_KEY = "demo-tour-dismissed";
const TOAST_KEY = "demo-tour-welcomed";

export function DemoTour() {
  const { data } = useCurrentUser();
  const isDemo = data?.user.email?.toLowerCase() === DEMO_EMAIL;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(true);

  const fetchStatus = useServerFn(getDemoStatus);
  const reset = useServerFn(resetDemoAccount);

  const status = useQuery({
    queryKey: ["demo-account-status"],
    queryFn: () => fetchStatus(),
    enabled: isDemo,
    staleTime: 60_000,
  });

  const resetMut = useMutation({
    mutationFn: () => reset(),
    onSuccess: () => {
      toast.success("Demo data reset");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!isDemo) return;
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    if (!localStorage.getItem(TOAST_KEY)) {
      localStorage.setItem(TOAST_KEY, "1");
      setTimeout(() => {
        toast("Welcome to the CivicPlexus demo", {
          description: "Take the guided tour to see every module in action.",
          action: { label: "Start tour", onClick: () => setOpen(true) },
          duration: 12_000,
        });
      }, 800);
    }
  }, [isDemo]);

  const stop = useMemo(() => TOUR_STOPS[step], [step]);

  if (!isDemo) return null;

  function start() {
    setStep(0);
    setOpen(true);
      navigate({ to: TOUR_STOPS[0].to as string });
  }
  function go(delta: number) {
    const next = Math.max(0, Math.min(TOUR_STOPS.length - 1, step + delta));
    setStep(next);
    navigate({ to: TOUR_STOPS[next].to as string });
  }
  function close() {
    setOpen(false);
  }
  function hideLauncher() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  const hoursLeft = status.data?.lastResetAt
    ? Math.max(0, 24 - Math.floor((Date.now() - new Date(status.data.lastResetAt).getTime()) / 3_600_000))
    : 24;

  return (
    <>
      {/* Demo banner */}
      <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200 text-amber-950">
        <div className="px-4 md:px-6 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs md:text-sm">
          <span className="font-medium">Demo mode</span>
          <span className="text-amber-900/80">
            Changes revert automatically (~{hoursLeft}h remaining).
            {status.data?.pendingChanges ? ` ${status.data.pendingChanges} pending change(s).` : ""}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={start}>
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Tour
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => resetMut.mutate()}
              disabled={resetMut.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              {resetMut.isPending ? "Resetting…" : "Reset now"}
            </Button>
            <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
              <a href="/api/public/docs/user-guide" target="_blank" rel="noreferrer">
                <BookOpen className="h-3.5 w-3.5 mr-1" /> Guide
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Floating launcher (after first dismiss of dialog, before banner click) */}
      {!open && !dismissed && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="flex items-center gap-1 rounded-full border bg-card shadow-lg pl-3 pr-1 py-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <button onClick={start} className="text-sm font-medium px-2 py-1">
              Take the guided tour
            </button>
            <button
              onClick={hideLauncher}
              aria-label="Dismiss tour launcher"
              className="h-7 w-7 grid place-items-center rounded-full hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {stop.title}
              <span className="ml-2 text-xs font-sans text-muted-foreground">
                Step {step + 1} of {TOUR_STOPS.length}
              </span>
            </DialogTitle>
            <DialogDescription>{stop.body}</DialogDescription>
          </DialogHeader>
          {stop.try && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">Try it: </span>
              {stop.try}
            </div>
          )}
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${((step + 1) / TOUR_STOPS.length) * 100}%` }}
            />
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              Close
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => go(-1)} disabled={step === 0}>
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
              {step < TOUR_STOPS.length - 1 ? (
                <Button size="sm" onClick={() => go(1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" onClick={close}>
                  Finish
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}