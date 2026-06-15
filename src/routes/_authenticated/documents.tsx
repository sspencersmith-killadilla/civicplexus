import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, FolderLock, FileDown, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/documents")({
  component: DocumentsPage,
});

const KINDS = ["id_document", "i9_supporting", "direct_deposit", "certification", "license", "training_cert", "background_check", "other"] as const;

function DocumentsPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = hasRole(me?.roles, "hr_admin") || hasRole(me?.roles, "it_admin") || hasRole(me?.roles, "hiring_manager");

  const { data: myEmp } = useQuery({
    queryKey: ["my-employee-doc", me?.user.id],
    enabled: !!me?.user.id,
    queryFn: async () => (await supabase.from("employees").select("id,first_name,last_name").eq("user_id", me!.user.id).maybeSingle()).data,
  });

  const { data: employees } = useQuery({
    queryKey: ["doc-employees"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("employees").select("id,first_name,last_name").order("last_name")).data,
  });

  const [selectedEmp, setSelectedEmp] = useState<string>("");
  const targetEmp = isAdmin ? selectedEmp : (myEmp?.id ?? "");

  const { data: docs } = useQuery({
    queryKey: ["docs", targetEmp],
    enabled: !!targetEmp,
    queryFn: async () => (await supabase.from("documents").select("*").eq("employee_id", targetEmp).order("created_at", { ascending: false })).data,
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("other");
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !targetEmp) throw new Error("Pick employee and file");
      const path = `${targetEmp}/${Date.now()}_${file.name}`;
      const { error: ue } = await supabase.storage.from("onboarding-documents").upload(path, file, { upsert: false });
      if (ue) throw ue;
      const { error: de } = await supabase.from("documents").insert({
        employee_id: targetEmp, kind, title: title || file.name, storage_path: path,
        mime_type: file.type, size_bytes: file.size, uploaded_by: me?.user.id,
      });
      if (de) throw de;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["docs", targetEmp] }); toast.success("Uploaded"); setOpen(false); setTitle(""); setKind("other"); setFile(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: async (d: { id: string; storage_path: string }) => {
      await supabase.storage.from("onboarding-documents").remove([d.storage_path]);
      const { error } = await supabase.from("documents").delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["docs", targetEmp] }); toast.success("Removed"); },
  });

  async function download(path: string) {
    const { data, error } = await supabase.storage.from("onboarding-documents").createSignedUrl(path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <AppShell title="Document Vault">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" /> Encrypted private storage · signed-URL access only</div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Select value={selectedEmp} onValueChange={setSelectedEmp}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Choose employee…" /></SelectTrigger>
              <SelectContent>{employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {targetEmp && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Upload className="h-4 w-4 mr-2" /> Upload</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Upload document</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Driver's license front" /></div>
                  <div className="space-y-2">
                    <Label>Kind</Label>
                    <Select value={kind} onValueChange={(v) => setKind(v as never)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>File</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
                </div>
                <DialogFooter><Button disabled={!file || upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? "Uploading…" : "Upload"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {!targetEmp ? (
        <Card className="p-10 text-center"><FolderLock className="h-8 w-8 mx-auto text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{isAdmin ? "Pick an employee above to view their documents." : "No employee record linked to your account yet."}</p></Card>
      ) : !docs?.length ? (
        <Card className="p-10 text-center"><FolderLock className="h-8 w-8 mx-auto text-muted-foreground" /><h3 className="mt-3 font-medium">No documents yet</h3><p className="mt-1 text-sm text-muted-foreground">Upload IDs, certifications, signed forms, and supporting paperwork.</p></Card>
      ) : (
        <Card className="divide-y">
          {docs.map((d) => (
            <div key={d.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium truncate">{d.title}</div>
                <div className="text-xs text-muted-foreground">{d.kind.replace(/_/g," ")} · {Math.round((d.size_bytes ?? 0)/1024)} KB · {new Date(d.created_at).toLocaleDateString()}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => download(d.storage_path)}><FileDown className="h-4 w-4 mr-1" /> Open</Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete?")) remove.mutate({ id: d.id, storage_path: d.storage_path }); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </AppShell>
  );
}