import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BadgeCheck, Check, Upload, ChevronLeft, ChevronRight, FileDown, User as UserIcon, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  createEmployeePhotoUploadUrl, confirmEmployeePhoto,
} from "@/lib/employee-photos.functions";
import { generateBadge } from "@/lib/id-badges.functions";

type Tpl = {
  id: string; name: string; org_name: string; accent_color: string;
  orientation: "landscape" | "portrait"; is_default: boolean;
  show_fields: { title?: boolean; department?: boolean; employee_id?: boolean; qr?: boolean };
  back_text: string | null;
};
type Emp = {
  id: string; first_name: string; last_name: string;
  job_title: string | null; department: string | null; photo_path: string | null;
};

const STEPS = ["Photo", "Template", "Preview", "Generate"] as const;

export function BadgeWizard({
  open, onOpenChange, employee, photoUrl,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: Emp;
  photoUrl: string | null | undefined;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState<string>("");
  const [issued, setIssued] = useState<{ serial: string; pdf_url: string | null; verify_url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const createUpload = useServerFn(createEmployeePhotoUploadUrl);
  const confirmPhoto = useServerFn(confirmEmployeePhoto);
  const gen = useServerFn(generateBadge);

  const { data: tpls } = useQuery({
    queryKey: ["badge-templates-full"],
    enabled: open,
    queryFn: async () => (await supabase.from("id_badge_templates")
      .select("id,name,org_name,accent_color,orientation,is_default,show_fields,back_text")
      .order("is_default", { ascending: false }).order("name")).data as Tpl[] | null,
  });

  useEffect(() => {
    if (!open) { setStep(0); setIssued(null); return; }
    if (!templateId && tpls?.length) setTemplateId(tpls.find((t) => t.is_default)?.id ?? tpls[0].id);
  }, [open, tpls, templateId]);

  const tpl = useMemo(() => tpls?.find((t) => t.id === templateId) ?? null, [tpls, templateId]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const { signed_url, path } = await createUpload({
        data: { employee_id: employee.id, content_type: file.type as "image/png" | "image/jpeg" | "image/webp" },
      });
      const up = await fetch(signed_url, { method: "PUT", headers: { "content-type": file.type, "x-upsert": "true" }, body: file });
      if (!up.ok) throw new Error("Upload failed");
      await confirmPhoto({ data: { employee_id: employee.id, path } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee", employee.id] }); toast.success("Photo uploaded"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const generate = useMutation({
    mutationFn: async () => await gen({ data: { employee_id: employee.id, template_id: templateId || undefined } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["employee-badges", employee.id] });
      setIssued(res);
      toast.success(`Badge ${res.serial} issued`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Generate failed"),
  });

  const hasPhoto = !!employee.photo_path;
  const canNext =
    step === 0 ? hasPhoto :
    step === 1 ? !!templateId :
    step === 2 ? true :
    false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5" /> CR80 Badge Wizard
          </DialogTitle>
        </DialogHeader>

        <ol className="flex items-center gap-2 text-xs">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${i < step ? "bg-primary text-primary-foreground border-primary" : i === step ? "border-primary text-primary" : "text-muted-foreground"}`}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={i === step ? "font-medium" : "text-muted-foreground"}>{s}</span>
              {i < STEPS.length - 1 && <span className="text-muted-foreground">›</span>}
            </li>
          ))}
        </ol>

        <div className="min-h-[280px] py-2">
          {step === 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-28 h-28 rounded-full overflow-hidden bg-muted flex items-center justify-center border">
                  {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : <UserIcon className="h-10 w-10 text-muted-foreground" />}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">{hasPhoto ? "Photo on file ✓" : "No photo on file"}</p>
                  <p className="text-xs text-muted-foreground">A clear, front-facing headshot is required for CR80 printing. PNG, JPEG, or WebP.</p>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.currentTarget.value = ""; }} />
                  <Button size="sm" variant={hasPhoto ? "outline" : "default"} onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                    <Upload className="h-4 w-4 mr-2" /> {upload.isPending ? "Uploading…" : hasPhoto ? "Replace photo" : "Upload photo"}
                  </Button>
                </div>
              </div>
              {!hasPhoto && (
                <div className="text-xs flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-900 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  Upload a photo to continue.
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <Label className="text-xs">Badge template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose template" /></SelectTrigger>
                <SelectContent>
                  {tpls?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_default ? " · default" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              {tpl && (
                <div className="text-xs grid grid-cols-2 gap-2 rounded border p-3">
                  <div><span className="text-muted-foreground">Org:</span> {tpl.org_name}</div>
                  <div className="flex items-center gap-2"><span className="text-muted-foreground">Accent:</span> <span className="inline-block h-3 w-6 rounded" style={{ background: tpl.accent_color }} /> {tpl.accent_color}</div>
                  <div><span className="text-muted-foreground">Orientation:</span> {tpl.orientation}</div>
                  <div><span className="text-muted-foreground">QR verify:</span> {tpl.show_fields?.qr !== false ? "Yes" : "No"}</div>
                </div>
              )}
              {!tpls?.length && (
                <p className="text-xs text-muted-foreground">No templates yet. Create one in ID Badge Templates.</p>
              )}
            </div>
          )}

          {step === 2 && tpl && (
            <div className="flex justify-center">
              <BadgePreview tpl={tpl} employee={employee} photoUrl={photoUrl ?? null} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-center py-4">
              {!issued ? (
                <>
                  <p className="text-sm">Ready to publish badge for <span className="font-medium">{employee.first_name} {employee.last_name}</span>.</p>
                  <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                    <BadgeCheck className="h-4 w-4 mr-2" /> {generate.isPending ? "Generating…" : "Generate & publish"}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary"><Check className="h-6 w-6" /></div>
                  <p className="text-sm">Badge <span className="font-mono">{issued.serial}</span> issued.</p>
                  <div className="flex justify-center gap-2">
                    {issued.pdf_url && (
                      <Button asChild size="sm" variant="outline">
                        <a href={issued.pdf_url} target="_blank" rel="noreferrer"><FileDown className="h-4 w-4 mr-2" /> Open print PDF</a>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || generate.isPending}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BadgePreview({ tpl, employee, photoUrl }: { tpl: Tpl; employee: Emp; photoUrl: string | null }) {
  const landscape = tpl.orientation === "landscape";
  // CR80 ratio 3.375 x 2.125 in (~1.586:1)
  const w = landscape ? 340 : 214;
  const h = landscape ? 214 : 340;
  const show = tpl.show_fields ?? {};
  return (
    <div
      className="rounded-lg shadow-lg overflow-hidden border bg-card text-card-foreground"
      style={{ width: w, height: h }}
    >
      <div className="px-3 py-2 text-[10px] font-semibold tracking-wide text-white truncate" style={{ background: tpl.accent_color }}>
        {tpl.org_name}
      </div>
      <div className={`p-3 grid gap-3 ${landscape ? "grid-cols-[80px_1fr]" : "grid-cols-1 justify-items-center text-center"}`}>
        <div className={`rounded ${landscape ? "h-[110px] w-[80px]" : "h-[120px] w-[90px]"} overflow-hidden bg-muted flex items-center justify-center border`}>
          {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : <UserIcon className="h-8 w-8 text-muted-foreground" />}
        </div>
        <div className="text-[11px] leading-tight space-y-1 min-w-0">
          <div className="font-semibold text-sm truncate">{employee.first_name} {employee.last_name}</div>
          {show.title !== false && <div className="truncate">{employee.job_title || "—"}</div>}
          {show.department !== false && <div className="text-muted-foreground truncate">{employee.department || "—"}</div>}
          {show.employee_id !== false && <div className="font-mono text-[10px] text-muted-foreground">ID {employee.id.slice(0, 8).toUpperCase()}</div>}
        </div>
      </div>
      <div className="px-3 pb-2 flex items-center justify-between text-[9px] text-muted-foreground">
        <span>CR80 · preview</span>
        {show.qr !== false && <span className="inline-block h-6 w-6 border border-foreground/40" style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,currentColor 0 2px,transparent 2px 4px),repeating-linear-gradient(90deg,currentColor 0 2px,transparent 2px 4px)",
          opacity: 0.5,
        }} />}
      </div>
    </div>
  );
}