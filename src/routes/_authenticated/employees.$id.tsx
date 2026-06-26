import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Trash2, BadgeCheck, ArrowLeft, FileDown, Ban, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import {
  createEmployeePhotoUploadUrl, confirmEmployeePhoto, getEmployeePhotoUrl, clearEmployeePhoto,
} from "@/lib/employee-photos.functions";
import { generateBadge, getBadgePdfUrl, revokeBadge } from "@/lib/id-badges.functions";

export const Route = createFileRoute("/_authenticated/employees/$id")({
  component: EmployeeProfile,
});

type Emp = {
  id: string; first_name: string; last_name: string; job_title: string | null; department: string | null;
  status: string; start_date: string | null; personal_email: string | null; work_email: string | null;
  phone: string | null; photo_path: string | null; manager_id: string | null;
};
type Tpl = { id: string; name: string; is_default: boolean };
type Badge = { id: string; serial: string; issued_at: string; revoked_at: string | null; pdf_path: string | null };

function EmployeeProfile() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isHr = hasRole(me?.roles, "hr_admin");

  const createUpload = useServerFn(createEmployeePhotoUploadUrl);
  const confirmPhoto = useServerFn(confirmEmployeePhoto);
  const photoUrlFn = useServerFn(getEmployeePhotoUrl);
  const clearPhoto = useServerFn(clearEmployeePhoto);
  const gen = useServerFn(generateBadge);
  const badgeUrlFn = useServerFn(getBadgePdfUrl);
  const revoke = useServerFn(revokeBadge);

  const { data: emp, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: async () => (await supabase.from("employees").select("id, first_name, last_name, job_title, department, status, start_date, personal_email, work_email, phone, photo_path, manager_id").eq("id", id).single()).data as Emp | null,
  });
  const { data: photoUrl } = useQuery({
    queryKey: ["employee-photo", emp?.photo_path],
    enabled: !!emp?.photo_path,
    queryFn: async () => (await photoUrlFn({ data: { path: emp!.photo_path! } })).url,
  });
  const { data: tpls } = useQuery({
    queryKey: ["badge-templates-min"],
    queryFn: async () => (await supabase.from("id_badge_templates").select("id,name,is_default").order("name")).data as Tpl[] | null,
  });
  const { data: badges } = useQuery({
    queryKey: ["employee-badges", id],
    queryFn: async () => (await supabase.from("id_badges").select("id, serial, issued_at, revoked_at, pdf_path").eq("employee_id", id).order("issued_at", { ascending: false })).data as Badge[] | null,
  });

  const [templateId, setTemplateId] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const { signed_url, path } = await createUpload({ data: { employee_id: id, content_type: file.type as "image/png" | "image/jpeg" | "image/webp" } });
      const up = await fetch(signed_url, { method: "PUT", headers: { "content-type": file.type, "x-upsert": "true" }, body: file });
      if (!up.ok) throw new Error("Upload failed");
      await confirmPhoto({ data: { employee_id: id, path } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee", id] }); toast.success("Photo updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const removePhoto = useMutation({
    mutationFn: async () => { await clearPhoto({ data: { employee_id: id } }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee", id] }); toast.success("Photo removed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const generate = useMutation({
    mutationFn: async () => await gen({ data: { employee_id: id, template_id: templateId || undefined } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["employee-badges", id] });
      toast.success(`Badge ${res.serial} generated`);
      if (res.pdf_url) window.open(res.pdf_url, "_blank");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Generate failed"),
  });

  const openPdf = useMutation({
    mutationFn: async (badge_id: string) => (await badgeUrlFn({ data: { badge_id } })).url,
    onSuccess: (url) => window.open(url, "_blank"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "PDF unavailable"),
  });

  const revokeBadgeM = useMutation({
    mutationFn: async (badge_id: string) => { await revoke({ data: { badge_id } }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee-badges", id] }); toast.success("Revoked"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading) return <AppShell title="Employee"><p className="text-muted-foreground">Loading…</p></AppShell>;
  if (!emp) return <AppShell title="Employee"><p className="text-muted-foreground">Not found.</p></AppShell>;

  return (
    <AppShell title={`${emp.first_name} ${emp.last_name}`}>
      <div className="mb-4"><Button asChild variant="ghost" size="sm"><Link to="/employees"><ArrowLeft className="h-4 w-4 mr-2" /> Back to employees</Link></Button></div>
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="p-5">
          <div className="flex flex-col items-center text-center">
            <div className="w-40 h-40 rounded-full overflow-hidden bg-muted flex items-center justify-center border">
              {photoUrl ? <img src={photoUrl} alt={`${emp.first_name} ${emp.last_name}`} className="w-full h-full object-cover" /> : <UserIcon className="h-16 w-16 text-muted-foreground" />}
            </div>
            <div className="mt-3 font-medium">{emp.first_name} {emp.last_name}</div>
            <div className="text-sm text-muted-foreground">{emp.job_title || "—"}</div>
            <div className="text-xs text-muted-foreground">{emp.department || "—"}</div>
            {isHr && (
              <div className="mt-4 w-full space-y-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto.mutate(f); e.currentTarget.value = ""; }} />
                <Button size="sm" className="w-full" onClick={() => fileRef.current?.click()} disabled={uploadPhoto.isPending}>
                  <Upload className="h-4 w-4 mr-2" /> {uploadPhoto.isPending ? "Uploading…" : (emp.photo_path ? "Replace photo" : "Upload photo")}
                </Button>
                {emp.photo_path && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => removePhoto.mutate()} disabled={removePhoto.isPending}>
                    <Trash2 className="h-4 w-4 mr-2" /> Remove photo
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5 md:col-span-2 space-y-3">
          <h2 className="font-medium">Profile</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><Label className="text-xs text-muted-foreground">Status</Label><div>{emp.status}</div></div>
            <div><Label className="text-xs text-muted-foreground">Start date</Label><div>{emp.start_date ?? "—"}</div></div>
            <div><Label className="text-xs text-muted-foreground">Work email</Label><div>{emp.work_email ?? "—"}</div></div>
            <div><Label className="text-xs text-muted-foreground">Personal email</Label><div>{emp.personal_email ?? "—"}</div></div>
            <div><Label className="text-xs text-muted-foreground">Phone</Label><div>{emp.phone ?? "—"}</div></div>
            <div><Label className="text-xs text-muted-foreground">Employee ID</Label><div className="font-mono text-xs">{emp.id.slice(0, 8).toUpperCase()}</div></div>
          </div>
          <div className="pt-2 flex gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/transcript/$employeeId" params={{ employeeId: emp.id }}>Transcript</Link></Button>
          </div>
        </Card>
      </div>

      {isHr && (
        <Card className="p-5 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium flex items-center gap-2"><BadgeCheck className="h-4 w-4" /> ID Badge</h2>
            <Button asChild size="sm" variant="ghost"><Link to="/id-badge-templates">Manage templates</Link></Button>
          </div>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="space-y-1">
              <Label className="text-xs">Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="w-64"><SelectValue placeholder={tpls?.find((t) => t.is_default)?.name ?? "Default"} /></SelectTrigger>
                <SelectContent>
                  {tpls?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_default ? " · default" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
              <BadgeCheck className="h-4 w-4 mr-2" /> {generate.isPending ? "Generating…" : "Generate badge PDF"}
            </Button>
          </div>
          {!badges?.length ? (
            <p className="text-sm text-muted-foreground">No badges issued yet.</p>
          ) : (
            <div className="divide-y border rounded">
              {badges.map((b) => (
                <div key={b.id} className="p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm">{b.serial}</div>
                    <div className="text-xs text-muted-foreground">
                      Issued {new Date(b.issued_at).toLocaleDateString()}
                      {b.revoked_at && ` · revoked ${new Date(b.revoked_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.pdf_path && <Button size="sm" variant="outline" onClick={() => openPdf.mutate(b.id)}><FileDown className="h-4 w-4 mr-1" /> Print</Button>}
                    {!b.revoked_at && <Button size="sm" variant="ghost" onClick={() => revokeBadgeM.mutate(b.id)}><Ban className="h-4 w-4 mr-1" /> Revoke</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </AppShell>
  );
}