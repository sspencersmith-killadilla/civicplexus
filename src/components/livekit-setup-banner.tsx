import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Video, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const REQUIRED = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const;

/**
 * Shown on interview pages when LiveKit credentials are not yet set.
 * HR admins see step-by-step setup; everyone else sees a soft "ask your admin" note.
 */
export function LiveKitSetupBanner({ isHrAdmin }: { isHrAdmin: boolean }) {
  if (!isHrAdmin) {
    return (
      <Alert>
        <Video className="h-4 w-4" />
        <AlertTitle>Live interview rooms aren't enabled yet</AlertTitle>
        <AlertDescription>
          Asynchronous video responses still work. Ask your HR admin to enable live panel rooms.
        </AlertDescription>
      </Alert>
    );
  }

  const copySecretNames = () => {
    void navigator.clipboard.writeText(REQUIRED.join("\n"));
    toast.success("Secret names copied");
  };

  return (
    <Alert>
      <Video className="h-4 w-4" />
      <AlertTitle>Enable live interview rooms</AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">
          Live multi-party panel rooms run on LiveKit. Async candidate takes and scorecards already work — this only adds the live panel mode.
        </p>
        <ol className="text-sm list-decimal pl-5 space-y-1">
          <li>Create a free project at <a className="underline" href="https://cloud.livekit.io" target="_blank" rel="noreferrer">cloud.livekit.io</a> (or self-host).</li>
          <li>On the project page, copy the <strong>WebSocket URL</strong> (<code>wss://…</code>), <strong>API Key</strong>, and <strong>API Secret</strong>.</li>
          <li>Open <strong>Project Settings → Secrets</strong> and save each as a backend secret using the names below.</li>
          <li>Reload this page — the "Join interview" button will activate automatically.</li>
          <li><em>Optional:</em> to record sessions, configure S3-compatible egress on the LiveKit project. Rooms work without it; only recording is skipped.</li>
        </ol>
        <div className="bg-muted rounded p-2 font-mono text-xs space-y-0.5">
          {REQUIRED.map((s) => <div key={s}>{s}</div>)}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={copySecretNames}>
            <Copy className="h-3 w-3 mr-1" /> Copy secret names
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href="/docs/self-hosting#livekit-live-interview-rooms" target="_blank" rel="noreferrer">
              <ExternalLink className="h-3 w-3 mr-1" /> Full setup guide
            </a>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}