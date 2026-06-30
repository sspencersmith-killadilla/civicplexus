import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { saveCareersCustomization } from "@/lib/careers-customization.functions";
import { getInterviewRetentionSettings, updateInterviewRetentionSettings } from "@/lib/interview-retention.functions";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["org-settings"], queryFn: async () => (await supabase.from("org_settings").select("*").maybeSingle()).data });
  const [form, setForm] = useState({ org_name: "", ein: "", address: "", phone: "", primary_color: "", accent_color: "", sso_metadata_url: "", retention_policy: "{}", require_mfa: false, sso_only: false, payroll_bureau: "", fed_employer_id: "" });
  const [careers, setCareers] = useState({ html: "", css: "" });
  const saveCareers = useServerFn(saveCareersCustomization);
  const getRetention = useServerFn(getInterviewRetentionSettings);
  const saveRetention = useServerFn(updateInterviewRetentionSettings);
  const retentionQ = useQuery({ queryKey: ["interview-retention"], queryFn: () => getRetention() });
  const [retention, setRetention] = useState({ days: 90, archive: false, bucket: "", prefix: "", note: "" });
  useEffect(() => {
    const s = retentionQ.data?.settings;
    if (s) setRetention({
      days: s.interview_retention_days,
      archive: !!s.interview_recording_archive_enabled,
      bucket: s.interview_recording_archive_bucket ?? "",
      prefix: s.interview_recording_archive_prefix ?? "",
      note: "",
    });
  }, [retentionQ.data]);
  const saveRetentionMut = useMutation({
    mutationFn: () => saveRetention({ data: {
      interview_retention_days: Number(retention.days) || 90,
      interview_recording_archive_enabled: retention.archive,
      interview_recording_archive_bucket: retention.bucket || null,
      interview_recording_archive_prefix: retention.prefix || null,
      note: retention.note || undefined,
    } }),
    onSuccess: () => { toast.success("Retention settings saved"); setRetention(r => ({ ...r, note: "" })); qc.invalidateQueries({ queryKey: ["interview-retention"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (data) setForm({
      org_name: data.org_name ?? "", ein: data.ein ?? "", address: data.address ?? "", phone: data.phone ?? "",
      primary_color: data.primary_color ?? "", accent_color: data.accent_color ?? "",
      sso_metadata_url: data.sso_metadata_url ?? "", retention_policy: JSON.stringify(data.retention_policy ?? {}, null, 2),
      require_mfa: !!data.require_mfa, sso_only: !!data.sso_only, payroll_bureau: data.payroll_bureau ?? "", fed_employer_id: data.fed_employer_id ?? "",
    });
    if (data) setCareers({
      html: (data as { careers_page_html?: string | null }).careers_page_html ?? "",
      css: (data as { careers_page_css?: string | null }).careers_page_css ?? "",
    });
  }, [data]);
  const saveCareersMut = useMutation({
    mutationFn: () => saveCareers({ data: { careers_page_html: careers.html || null, careers_page_css: careers.css || null } }),
    onSuccess: () => { toast.success("Careers page saved"); qc.invalidateQueries({ queryKey: ["org-settings"] }); qc.invalidateQueries({ queryKey: ["public-careers-customization"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("No settings row");
      let retention: unknown = {};
      try { retention = JSON.parse(form.retention_policy); } catch { throw new Error("Retention policy must be valid JSON"); }
      const { error } = await supabase.from("org_settings").update({
        org_name: form.org_name, ein: form.ein || null, address: form.address || null, phone: form.phone || null,
        primary_color: form.primary_color, accent_color: form.accent_color,
        sso_metadata_url: form.sso_metadata_url || null, retention_policy: retention as never,
        require_mfa: form.require_mfa, sso_only: form.sso_only,
        payroll_bureau: form.payroll_bureau || null, fed_employer_id: form.fed_employer_id || null,
      }).eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["org-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Admin Settings">
      <div className="grid gap-6 max-w-2xl">
        <Card className="p-6 space-y-4">
          <h3 className="font-serif text-lg">Organization</h3>
          <div><Label>Name</Label><Input value={form.org_name} onChange={(e) => setForm({ ...form, org_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>EIN</Label><Input value={form.ein} onChange={(e) => setForm({ ...form, ein: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        </Card>
        <Card className="p-6 space-y-4">
          <h3 className="font-serif text-lg">Branding</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Primary Color</Label><Input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} /></div>
            <div><Label>Accent Color</Label><Input type="color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} /></div>
          </div>
        </Card>
        <Card className="p-6 space-y-4">
          <h3 className="font-serif text-lg">Retention Policy</h3>
          <p className="text-xs text-muted-foreground">JSON map of document kinds to retention years.</p>
          <Textarea rows={6} className="font-mono text-xs" value={form.retention_policy} onChange={(e) => setForm({ ...form, retention_policy: e.target.value })} />
        </Card>
        <Card className="p-6 space-y-4">
          <h3 className="font-serif text-lg">SSO (SAML)</h3>
          <div><Label>Metadata URL</Label><Input value={form.sso_metadata_url} onChange={(e) => setForm({ ...form, sso_metadata_url: e.target.value })} placeholder="https://idp.example.com/metadata" /></div>
          <div className="flex items-center justify-between"><div><Label>Require MFA</Label><p className="text-xs text-muted-foreground">All users must complete MFA before access.</p></div><Switch checked={form.require_mfa} onCheckedChange={(v) => setForm({ ...form, require_mfa: v })} /></div>
          <div className="flex items-center justify-between"><div><Label>SSO only</Label><p className="text-xs text-muted-foreground">Block password sign-in for non-admins.</p></div><Switch checked={form.sso_only} onCheckedChange={(v) => setForm({ ...form, sso_only: v })} /></div>
        </Card>
        <Card className="p-6 space-y-4">
          <h3 className="font-serif text-lg">Payroll</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Bureau</Label><Input value={form.payroll_bureau} onChange={(e) => setForm({ ...form, payroll_bureau: e.target.value })} placeholder="ADP / Paylocity / Paycom / Tyler Munis" /></div>
            <div><Label>Federal Employer ID (EIN)</Label><Input value={form.fed_employer_id} onChange={(e) => setForm({ ...form, fed_employer_id: e.target.value })} placeholder="XX-XXXXXXX" /></div>
          </div>
        </Card>
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-fit">Save Settings</Button>
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="font-serif text-lg">Interview recording retention</h3>
            <p className="text-xs text-muted-foreground">Sets how long one-way and live interview recordings are kept before automatic purge. Optionally mirror to an external S3 bucket for long-term legal hold. Every change is logged with the actor and time.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Retention (days)</Label>
              <div className="flex gap-2">
                <Input type="number" min={7} max={3650} value={retention.days} onChange={(e) => setRetention({ ...retention, days: Number(e.target.value) })} />
                {[30, 90, 180, 365].map(d => (
                  <Button key={d} type="button" variant="outline" size="sm" onClick={() => setRetention({ ...retention, days: d })}>{d}</Button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Archive to S3</Label><p className="text-xs text-muted-foreground">Mirror recordings before purge.</p></div>
              <Switch checked={retention.archive} onCheckedChange={(v) => setRetention({ ...retention, archive: v })} />
            </div>
          </div>
          {retention.archive && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>S3 bucket</Label><Input value={retention.bucket} onChange={(e) => setRetention({ ...retention, bucket: e.target.value })} placeholder="city-hr-interview-archive" /></div>
              <div><Label>Key prefix (optional)</Label><Input value={retention.prefix} onChange={(e) => setRetention({ ...retention, prefix: e.target.value })} placeholder="interviews/" /></div>
            </div>
          )}
          <div>
            <Label>Change note (audit)</Label>
            <Input value={retention.note} onChange={(e) => setRetention({ ...retention, note: e.target.value })} placeholder="Why is this change being made?" />
          </div>
          <Button onClick={() => saveRetentionMut.mutate()} disabled={saveRetentionMut.isPending} className="w-fit">Save retention settings</Button>
          <div>
            <h4 className="font-medium text-sm mb-2">Recent changes</h4>
            {retentionQ.data?.audit?.length ? (
              <ul className="space-y-2 text-xs">
                {retentionQ.data.audit.map(a => (
                  <li key={a.id} className="border rounded p-2">
                    <div className="text-muted-foreground">{new Date(a.created_at).toLocaleString()} · actor {a.actor_id?.slice(0, 8) ?? "—"}</div>
                    <div>
                      Retention: <strong>{a.previous.interview_retention_days}d → {a.next.interview_retention_days}d</strong>
                      {" · "}Archive: <strong>{a.previous.interview_recording_archive_enabled ? "on" : "off"} → {a.next.interview_recording_archive_enabled ? "on" : "off"}</strong>
                      {a.next.interview_recording_archive_bucket ? <> · bucket <code>{a.next.interview_recording_archive_bucket}</code></> : null}
                    </div>
                    {a.note ? <div className="italic">"{a.note}"</div> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted-foreground">No changes recorded yet.</p>}
          </div>
        </Card>
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="font-serif text-lg">Public careers page</h3>
            <p className="text-xs text-muted-foreground">Override the default header with your own HTML and CSS. Leave both blank to use the standard layout. The job listings below the header are always shown.</p>
          </div>
          <div>
            <Label>Custom HTML (replaces the page header)</Label>
            <Textarea rows={8} className="font-mono text-xs" value={careers.html} onChange={(e) => setCareers({ ...careers, html: e.target.value })} placeholder={'<section class="careers-hero">\n  <h1>Join our team</h1>\n  <p>Public service. Real impact.</p>\n</section>'} />
          </div>
          <div>
            <Label>Custom CSS</Label>
            <Textarea rows={8} className="font-mono text-xs" value={careers.css} onChange={(e) => setCareers({ ...careers, css: e.target.value })} placeholder={'.careers-hero { background: linear-gradient(120deg, #0f3460, #16213e); color: white; padding: 4rem 1.5rem; text-align: center; }\n.careers-hero h1 { font-size: 2.5rem; }'} />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => saveCareersMut.mutate()} disabled={saveCareersMut.isPending}>Save careers page</Button>
            <Button asChild variant="outline"><a href="/careers" target="_blank" rel="noreferrer">Preview</a></Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}