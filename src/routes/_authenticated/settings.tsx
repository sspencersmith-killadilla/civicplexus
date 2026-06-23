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

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["org-settings"], queryFn: async () => (await supabase.from("org_settings").select("*").maybeSingle()).data });
  const [form, setForm] = useState({ org_name: "", ein: "", address: "", phone: "", primary_color: "", accent_color: "", sso_metadata_url: "", retention_policy: "{}", require_mfa: false, sso_only: false, payroll_bureau: "", fed_employer_id: "" });

  useEffect(() => {
    if (data) setForm({
      org_name: data.org_name ?? "", ein: data.ein ?? "", address: data.address ?? "", phone: data.phone ?? "",
      primary_color: data.primary_color ?? "", accent_color: data.accent_color ?? "",
      sso_metadata_url: data.sso_metadata_url ?? "", retention_policy: JSON.stringify(data.retention_policy ?? {}, null, 2),
      require_mfa: !!data.require_mfa, sso_only: !!data.sso_only, payroll_bureau: data.payroll_bureau ?? "", fed_employer_id: data.fed_employer_id ?? "",
    });
  }, [data]);

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
      </div>
    </AppShell>
  );
}