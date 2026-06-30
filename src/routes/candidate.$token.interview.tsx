import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Camera, Mic, ShieldCheck, Clock, RefreshCw, CheckCircle2, AlertTriangle, Accessibility } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/candidate/$token/interview")({ component: InterviewRunner });

type Question = { id: string; prompt: string; think_seconds: number; max_answer_seconds: number; allow_retake: boolean };
type Status = {
  invitation: { id: string; status: string; kind: "one_way" | "live"; consent_at: string | null; aivi_disclosure_ack_at: string | null; expires_at: string; retention_days: number; accommodation_request: { extra_think_seconds?: number; extra_answer_seconds?: number; captions_required?: boolean } | null; accommodation_approved_at: string | null };
  kit: { name: string; description: string | null; questions: Question[]; ai_assist_default: boolean };
  application: { applicant_name: string; email: string };
  requisition: { title: string; department: string | null; location: string | null };
  responses: Array<{ question_id: string; take_number: number; is_final: boolean; duration_seconds: number | null }>;
};

function fmt(s: number) { const m = Math.floor(s / 60), r = s % 60; return `${m}:${r.toString().padStart(2, "0")}`; }

function InterviewRunner() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<Status>({
    queryKey: ["interview", token],
    queryFn: async () => {
      const r = await fetch(`/api/public/interview/${token}/status`);
      if (!r.ok) throw new Error((await r.json()).error || "Failed to load");
      return r.json();
    },
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="p-8 max-w-md text-center"><AlertTriangle className="h-10 w-10 mx-auto text-destructive mb-2" /><h2 className="text-xl font-semibold mb-1">Interview link unavailable</h2><p className="text-sm text-muted-foreground">{(error as Error)?.message || "This link is invalid, expired, or revoked."}</p></Card>
    </div>
  );

  if (data.invitation.status === "submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="p-8 max-w-lg text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-600 mb-2" />
          <h2 className="text-2xl font-semibold mb-1">Interview submitted</h2>
          <p className="text-sm text-muted-foreground">Thanks {data.application.applicant_name}. The hiring team for <strong>{data.requisition.title}</strong> will review your responses.</p>
          <p className="text-xs text-muted-foreground mt-4">Your recordings will be retained for {data.invitation.retention_days} days, then automatically deleted. You may request a copy or deletion sooner using your candidate portal.</p>
        </Card>
      </div>
    );
  }

  return data.invitation.consent_at
    ? <Runner data={data} onRefresh={() => qc.invalidateQueries({ queryKey: ["interview", token] })} token={token} />
    : <ConsentGate data={data} onContinue={() => qc.invalidateQueries({ queryKey: ["interview", token] })} token={token} />;
}

function ConsentGate({ data, token, onContinue }: { data: Status; token: string; onContinue: () => void }) {
  const [consent, setConsent] = useState(false);
  const [ack, setAck] = useState(false);
  const [accom, setAccom] = useState(false);
  const [accomText, setAccomText] = useState("");
  const [device, setDevice] = useState<{ mic_ok: boolean; cam_ok: boolean } | null>(null);
  const [testing, setTesting] = useState(false);

  const testDevices = async () => {
    setTesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      const mic = stream.getAudioTracks().length > 0;
      const cam = stream.getVideoTracks().length > 0;
      stream.getTracks().forEach((t) => t.stop());
      setDevice({ mic_ok: mic, cam_ok: cam });
    } catch (e) {
      toast.error("Camera/mic blocked. Please allow access and try again.");
      setDevice({ mic_ok: false, cam_ok: false });
    } finally { setTesting(false); }
  };

  const submitAccom = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/public/interview/${token}/accommodation`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: accomText, extra_think_seconds: 60, extra_answer_seconds: 60, captions_required: true }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
    },
    onSuccess: () => toast.success("Accommodation request submitted. Our team will review it."),
    onError: (e: Error) => toast.error(e.message),
  });

  const proceed = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/public/interview/${token}/consent`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true, aivi_ack: ack,
          device_check: { browser: navigator.userAgent, mic_ok: device?.mic_ok ?? false, cam_ok: device?.cam_ok ?? false },
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
    },
    onSuccess: onContinue,
    onError: (e: Error) => toast.error(e.message),
  });

  const canContinue = consent && ack && device?.mic_ok && device?.cam_ok;

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="p-6 space-y-2">
          <Badge variant="secondary">{data.requisition.department ?? "City of McKinney"}</Badge>
          <h1 className="text-2xl font-semibold">{data.requisition.title} — Video Interview</h1>
          <p className="text-sm text-muted-foreground">Hi {data.application.applicant_name}, this is your one-way video interview. You'll record answers to {data.kit.questions.length} question{data.kit.questions.length === 1 ? "" : "s"}. You may re-record each question one time. <strong>If you record a take 2, that becomes your final answer automatically.</strong></p>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Consent & disclosures</h2>
          <div className="text-sm space-y-3">
            <p>By continuing, you acknowledge that this session is being recorded for the sole purpose of evaluating your candidacy. Recordings are accessible only to authorized HR staff and the hiring panel, are stored securely, and are automatically deleted after <strong>{data.invitation.retention_days} days</strong> from submission. You may request a copy or earlier deletion at any time.</p>
            <p className="text-xs text-muted-foreground">Disclosures: Illinois Artificial Intelligence Video Interview Act (AIVI) & NYC Local Law 144 — AI tools may be used to transcribe and summarize your responses to assist human reviewers. <strong>Final decisions are made by people, not by AI.</strong> You may decline AI analysis without affecting your application.</p>
          </div>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} /><span>I consent to being recorded for this interview.</span></label>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} /><span>I have read and understood the AI use disclosure.</span></label>
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Camera className="h-5 w-5" />Device check</h2>
          <p className="text-sm text-muted-foreground">Quickly test your camera and microphone before starting.</p>
          <Button variant="outline" onClick={testDevices} disabled={testing}>{testing ? "Testing…" : "Test camera & mic"}</Button>
          {device && (
            <div className="text-sm flex gap-4">
              <span className={device.mic_ok ? "text-green-600" : "text-destructive"}><Mic className="h-4 w-4 inline mr-1" />{device.mic_ok ? "OK" : "Blocked"}</span>
              <span className={device.cam_ok ? "text-green-600" : "text-destructive"}><Camera className="h-4 w-4 inline mr-1" />{device.cam_ok ? "OK" : "Blocked"}</span>
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Accessibility className="h-5 w-5" />Need an accommodation? (ADA)</h2>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={accom} onCheckedChange={(v) => setAccom(!!v)} /><span>Yes, I would like to request an accommodation.</span></label>
          {accom && (
            <div className="space-y-2">
              <Label className="text-xs">Describe what you need (e.g. extended time, live captions, alternative format). This does not affect your candidacy.</Label>
              <Textarea value={accomText} onChange={(e) => setAccomText(e.target.value)} rows={3} />
              <Button size="sm" variant="secondary" onClick={() => submitAccom.mutate()} disabled={!accomText.trim() || submitAccom.isPending}>Submit request</Button>
            </div>
          )}
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => proceed.mutate()} disabled={!canContinue || proceed.isPending}>Start interview</Button>
        </div>
      </div>
    </div>
  );
}

function Runner({ data, token, onRefresh }: { data: Status; token: string; onRefresh: () => void }) {
  const [idx, setIdx] = useState(0);
  const q = data.kit.questions[idx];
  const responsesByQ = useMemo(() => {
    const m = new Map<string, Array<{ take_number: number; is_final: boolean }>>();
    data.responses.forEach((r) => {
      const a = m.get(r.question_id) ?? [];
      a.push({ take_number: r.take_number, is_final: r.is_final });
      m.set(r.question_id, a);
    });
    return m;
  }, [data.responses]);

  if (!q) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  const takes = responsesByQ.get(q.id) ?? [];
  const hasTake1 = takes.some((t) => t.take_number === 1);
  const hasTake2 = takes.some((t) => t.take_number === 2);
  const finalDone = takes.some((t) => t.is_final);
  const allDone = data.kit.questions.every((qq) => (responsesByQ.get(qq.id) ?? []).some((t) => t.is_final));

  const finalize = async () => {
    const r = await fetch(`/api/public/interview/${token}/finalize`, { method: "POST" });
    if (!r.ok) { toast.error((await r.json()).error || "Submission failed"); return; }
    toast.success("Interview submitted.");
    onRefresh();
  };

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card className="p-4 flex justify-between items-center">
          <div>
            <div className="text-xs text-muted-foreground">{data.requisition.title}</div>
            <div className="font-semibold">Question {idx + 1} of {data.kit.questions.length}</div>
          </div>
          <div className="flex gap-1">
            {data.kit.questions.map((qq, i) => {
              const f = (responsesByQ.get(qq.id) ?? []).some((t) => t.is_final);
              return <button key={qq.id} onClick={() => setIdx(i)} className={`h-2 w-8 rounded-full ${i === idx ? "bg-primary" : f ? "bg-green-500" : "bg-muted-foreground/30"}`} aria-label={`Question ${i + 1}`} />;
            })}
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertTitle>Think time: {fmt(q.think_seconds)} · Max answer: {fmt(q.max_answer_seconds)}</AlertTitle>
            <AlertDescription>You may re-record once. Take 2 is final automatically.</AlertDescription>
          </Alert>
          <div className="text-lg">{q.prompt}</div>
          <Recorder
            key={q.id}
            token={token}
            question={q}
            hasTake1={hasTake1}
            hasTake2={hasTake2}
            finalDone={finalDone}
            onUploaded={onRefresh}
          />
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Previous</Button>
          {idx < data.kit.questions.length - 1
            ? <Button onClick={() => setIdx(idx + 1)} disabled={!finalDone}>Next question</Button>
            : <Button onClick={finalize} disabled={!allDone}>Submit interview</Button>}
        </div>
      </div>
    </div>
  );
}

function Recorder({ token, question, hasTake1, hasTake2, finalDone, onUploaded }: { token: string; question: Question; hasTake1: boolean; hasTake2: boolean; finalDone: boolean; onUploaded: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [phase, setPhase] = useState<"idle" | "thinking" | "recording" | "review" | "uploading">("idle");
  const [countdown, setCountdown] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [takeNumber, setTakeNumber] = useState<1 | 2>(hasTake1 ? 2 : 1);

  useEffect(() => {
    setTakeNumber(hasTake1 ? 2 : 1);
  }, [hasTake1]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const startPreview = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720 } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; await videoRef.current.play(); }
    } catch { toast.error("Could not access camera/microphone"); }
  };

  const beginTake = async () => {
    if (!streamRef.current) await startPreview();
    if (!streamRef.current) return;
    setPhase("thinking");
    setCountdown(question.think_seconds);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); startRecording(); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const startRecording = () => {
    const stream = streamRef.current!;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const b = new Blob(chunksRef.current, { type: "video/webm" });
      setBlob(b);
      setPhase("review");
    };
    recorderRef.current = rec;
    rec.start(1000);
    setPhase("recording");
    setCountdown(question.max_answer_seconds);
    const start = Date.now();
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); stopRecording(start); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const stopRecording = (start?: number) => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    if (start) setDuration(Math.round((Date.now() - start) / 1000));
    else setDuration(question.max_answer_seconds - countdown);
  };

  const upload = async (setFinal: boolean) => {
    if (!blob) return;
    setPhase("uploading");
    try {
      const signRes = await fetch(`/api/public/interview/${token}/upload-url`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: question.id, take_number: takeNumber, mime: "video/webm" }),
      });
      if (!signRes.ok) throw new Error((await signRes.json()).error);
      const { upload_url, path } = await signRes.json();
      const up = await fetch(upload_url, { method: "PUT", body: blob, headers: { "Content-Type": "video/webm" } });
      if (!up.ok) throw new Error(`Upload failed (${up.status})`);
      const sub = await fetch(`/api/public/interview/${token}/submit-take`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: question.id, take_number: takeNumber, path, mime: "video/webm", duration_seconds: Math.max(duration, 1), set_final: setFinal }),
      });
      if (!sub.ok) throw new Error((await sub.json()).error);
      toast.success(takeNumber === 2 ? "Take 2 saved (final)." : setFinal ? "Take saved as your final answer." : "Take saved.");
      onUploaded();
      setBlob(null);
      setPhase("idle");
    } catch (e) {
      toast.error((e as Error).message);
      setPhase("review");
    }
  };

  if (finalDone) {
    return (
      <div className="text-sm text-green-700 flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />Final answer saved for this question. {hasTake2 ? "Take 2 was used." : "You may move on, or click below to redo (replaces with a final take 2)."}
        {!hasTake2 && question.allow_retake && (
          <Button size="sm" variant="outline" className="ml-2" onClick={() => { setTakeNumber(2); setBlob(null); setPhase("idle"); }}><RefreshCw className="h-4 w-4 mr-1" />Re-record (take 2 = final)</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="aspect-video bg-black rounded overflow-hidden relative">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline />
        {phase === "thinking" && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-5xl font-bold">{countdown}</div>}
        {phase === "recording" && <div className="absolute top-3 right-3 bg-red-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-white animate-pulse" />REC {fmt(countdown)}</div>}
      </div>
      <div className="text-xs text-muted-foreground">Take {takeNumber} of 2 {takeNumber === 2 && "— this take will be final."}</div>
      {phase === "idle" && <Button onClick={beginTake}>Start take {takeNumber}</Button>}
      {phase === "recording" && <Button variant="destructive" onClick={() => stopRecording()}>Stop recording</Button>}
      {phase === "review" && blob && (
        <div className="space-y-2">
          <video src={URL.createObjectURL(blob)} controls className="w-full rounded" />
          <div className="flex gap-2">
            {takeNumber === 1
              ? <>
                  <Button onClick={() => upload(true)}>Submit as final answer</Button>
                  <Button variant="outline" onClick={() => upload(false)}>Save & try take 2</Button>
                  <Button variant="ghost" onClick={() => { setBlob(null); setPhase("idle"); }}>Discard</Button>
                </>
              : <>
                  <Button onClick={() => upload(true)}>Submit take 2 (final)</Button>
                  <Button variant="ghost" onClick={() => { setBlob(null); setPhase("idle"); }}>Discard</Button>
                </>}
          </div>
        </div>
      )}
      {phase === "uploading" && <div className="text-sm text-muted-foreground">Uploading…</div>}
    </div>
  );
}