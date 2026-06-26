import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Key, RotateCw, Copy } from "lucide-react";
import { toast } from "sonner";
import { mintScimToken, revokeScimToken, replayProvisioningEvent } from "@/lib/scim.functions";

export const Route = createFileRoute("/_authenticated/admin-identity")({ component: IdentityAdmin });

function IdentityAdmin() {
  const qc = useQueryClient();
  const mint = useServerFn(mintScimToken);
  const revoke = useServerFn(revokeScimToken);
  const replay = useServerFn(replayProvisioningEvent);
  const [newToken, setNewToken] = useState<string | null>(null);

  const providersQ = useQuery({
    queryKey: ["idps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("identity_providers").select("*").order("created_at", { ascending: false });
      if (error) throw error; return data ?? [];
    },
  });
  const tokensQ = useQuery({
    queryKey: ["scim-tokens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("scim_tokens").select("*, identity_providers(name)").order("created_at", { ascending: false });
      if (error) throw error; return data ?? [];
    },
  });
  const eventsQ = useQuery({
    queryKey: ["prov-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("provisioning_events").select("*, employees(first_name,last_name)").order("created_at", { ascending: false }).limit(50);
      if (error) throw error; return data ?? [];
    },
  });

  const [form, setForm] = useState({ name: "", kind: "azure_ad", domain: "" });
  const createIdp = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("identity_providers").insert({ name: form.name, kind: form.kind, domain: form.domain || null } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Provider added"); setForm({ name: "", kind: "azure_ad", domain: "" }); qc.invalidateQueries({ queryKey: ["idps"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [tokenForm, setTokenForm] = useState({ provider_id: "", label: "" });
  const mintMut = useMutation({
    mutationFn: async () => mint({ data: { provider_id: tokenForm.provider_id, label: tokenForm.label } }),
    onSuccess: (res) => { setNewToken(res.token); setTokenForm({ provider_id: "", label: "" }); qc.invalidateQueries({ queryKey: ["scim-tokens"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const scimUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/scim/v2/Users`;

  return (
    <AppShell title="Identity & Single Sign-On">
      <p className="text-sm text-muted-foreground mb-6">
        Connect Azure AD, Google Workspace, or Okta to synchronize user lifecycle (provision on hire, suspend on termination). External directories push to the SCIM v2 endpoint below using a bearer token you mint here.
      </p>

      <Card className="p-4 mb-6">
        <h3 className="font-medium mb-2 flex items-center gap-2"><Key className="h-4 w-4" /> SCIM endpoint</h3>
        <code className="text-xs bg-muted px-2 py-1 rounded block">{scimUrl}</code>
        <p className="text-xs text-muted-foreground mt-2">Configure this URL plus a bearer token in your IdP's provisioning settings.</p>
      </Card>

      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Identity providers</h3>
          <Dialog>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add provider</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Register an identity provider</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Display name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="City Azure AD" /></div>
                <div>
                  <Label>Kind</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="azure_ad">Azure AD / Entra ID</SelectItem>
                      <SelectItem value="google_workspace">Google Workspace</SelectItem>
                      <SelectItem value="okta">Okta</SelectItem>
                      <SelectItem value="onelogin">OneLogin</SelectItem>
                      <SelectItem value="generic_scim">Generic SCIM 2.0</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Domain (optional)</Label><Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="cityofmckinney.gov" /></div>
              </div>
              <DialogFooter><Button disabled={!form.name || createIdp.isPending} onClick={() => createIdp.mutate()}>{createIdp.isPending ? "Saving…" : "Add"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Kind</TableHead><TableHead>Domain</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {(providersQ.data ?? []).map((p: any) => (
              <TableRow key={p.id}><TableCell>{p.name}</TableCell><TableCell><Badge variant="outline">{p.kind}</Badge></TableCell><TableCell>{p.domain ?? "—"}</TableCell><TableCell>{p.status}</TableCell></TableRow>
            ))}
            {(providersQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No providers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">SCIM bearer tokens</h3>
          <Dialog>
            <DialogTrigger asChild><Button size="sm" disabled={(providersQ.data?.length ?? 0) === 0}><Plus className="h-4 w-4 mr-1" /> Mint token</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{newToken ? "Save this token" : "Mint a SCIM token"}</DialogTitle></DialogHeader>
              {newToken ? (
                <div className="space-y-3">
                  <p className="text-sm">This is the only time the token will be shown. Copy and paste it into your IdP now.</p>
                  <div className="flex gap-2">
                    <code className="text-xs bg-muted px-2 py-2 rounded flex-1 break-all">{newToken}</code>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(newToken); toast.success("Copied"); }}><Copy className="h-3 w-3" /></Button>
                  </div>
                  <Button onClick={() => setNewToken(null)}>Done</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label>Provider</Label>
                    <Select value={tokenForm.provider_id} onValueChange={(v) => setTokenForm({ ...tokenForm, provider_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Pick a provider" /></SelectTrigger>
                      <SelectContent>{(providersQ.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Label</Label><Input value={tokenForm.label} onChange={(e) => setTokenForm({ ...tokenForm, label: e.target.value })} placeholder="Production SCIM key" /></div>
                  <Button disabled={!tokenForm.provider_id || !tokenForm.label || mintMut.isPending} onClick={() => mintMut.mutate()}>{mintMut.isPending ? "Minting…" : "Mint"}</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Provider</TableHead><TableHead>Prefix</TableHead><TableHead>Last used</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(tokensQ.data ?? []).map((t: any) => (
              <TableRow key={t.id}>
                <TableCell>{t.label}</TableCell>
                <TableCell>{t.identity_providers?.name ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono">{t.token_prefix}…</TableCell>
                <TableCell>{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : "never"}</TableCell>
                <TableCell>{t.revoked_at ? <Badge variant="destructive">revoked</Badge> : <Badge>active</Badge>}</TableCell>
                <TableCell>{!t.revoked_at && <Button size="sm" variant="outline" onClick={async () => { await revoke({ data: { id: t.id } }); qc.invalidateQueries({ queryKey: ["scim-tokens"] }); }}>Revoke</Button>}</TableCell>
              </TableRow>
            ))}
            {(tokensQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No tokens.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium mb-3">Provisioning events</h3>
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Direction</TableHead><TableHead>Action</TableHead><TableHead>Employee</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(eventsQ.data ?? []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs">{new Date(e.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline">{e.direction}</Badge></TableCell>
                <TableCell>{e.action}</TableCell>
                <TableCell>{e.employees ? `${e.employees.first_name} ${e.employees.last_name}` : "—"}</TableCell>
                <TableCell>
                  <Badge variant={e.status === "failed" ? "destructive" : e.status === "succeeded" ? "default" : "secondary"}>{e.status}</Badge>
                </TableCell>
                <TableCell>{(e.status === "failed" || e.status === "queued") && <Button size="sm" variant="ghost" onClick={async () => { await replay({ data: { id: e.id } }); qc.invalidateQueries({ queryKey: ["prov-events"] }); }}><RotateCw className="h-3 w-3" /></Button>}</TableCell>
              </TableRow>
            ))}
            {(eventsQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No events yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
