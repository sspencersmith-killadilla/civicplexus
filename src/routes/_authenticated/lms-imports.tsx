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
import { Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { previewLmsImport, commitLmsImport } from "@/lib/lms.functions";

export const Route = createFileRoute("/_authenticated/lms-imports")({ component: LmsImportsPage });

function LmsImportsPage() {
  const qc = useQueryClient();
  const preview = useServerFn(previewLmsImport);
  const commit = useServerFn(commitLmsImport);
  const [provider, setProvider] = useState("tcole");
  const [file, setFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<{ id: string; total: number; matched: number; unmatched: number; errors: { row: number; error: string }[] } | null>(null);

  const importsQ = useQuery({ queryKey: ["lms-imports"], queryFn: async () => {
    const { data, error } = await supabase.from("lms_credit_imports").select("*").order("created_at", { ascending: false }).limit(25);
    if (error) throw error; return data ?? [];
  }});

  const previewMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Pick a CSV file");
      const csv = await file.text();
      return preview({ data: { provider, filename: file.name, csv } });
    },
    onSuccess: (r) => { setPreviewResult(r); qc.invalidateQueries({ queryKey: ["lms-imports"] }); toast.success("Preview ready"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const commitMut = useMutation({
    mutationFn: async () => commit({ data: { id: previewResult!.id } }),
    onSuccess: (r) => { toast.success(`Applied ${r.applied} completions`); setPreviewResult(null); setFile(null); qc.invalidateQueries({ queryKey: ["lms-imports"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="LMS Credit Imports">
      <p className="text-sm text-muted-foreground mb-6">Upload completion rosters from TCOLE, Target Solutions, Vector, or other learning systems. Rows are matched to employees by email and to courses by external course ID or name; matched rows auto-complete training and issue certifications.</p>

      <Card className="p-4 mb-6">
        <h3 className="font-medium mb-3 flex items-center gap-2"><Upload className="h-4 w-4" /> Upload roster</h3>
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <div><Label>Provider</Label><Select value={provider} onValueChange={setProvider}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="tcole">TCOLE</SelectItem>
            <SelectItem value="target_solutions">Target Solutions</SelectItem>
            <SelectItem value="vector">Vector Solutions</SelectItem>
            <SelectItem value="manual">Manual / Other</SelectItem>
          </SelectContent></Select></div>
          <div className="sm:col-span-2"><Label>CSV file</Label><Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Expected columns: <code>email</code>, <code>course_id</code> (or <code>course</code>), <code>completed_at</code>, optional <code>score</code>.</p>
        <Button onClick={() => previewMut.mutate()} disabled={!file || previewMut.isPending}>{previewMut.isPending ? "Parsing…" : "Preview"}</Button>
      </Card>

      {previewResult && (
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Preview</h3>
            <Button onClick={() => commitMut.mutate()} disabled={previewResult.matched === 0 || commitMut.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-1" />{commitMut.isPending ? "Applying…" : `Commit ${previewResult.matched} completions`}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Stat label="Total rows" value={previewResult.total} />
            <Stat label="Matched" value={previewResult.matched} accent="good" />
            <Stat label="Unmatched" value={previewResult.unmatched} accent={previewResult.unmatched > 0 ? "warn" : undefined} />
          </div>
          {previewResult.errors.length > 0 && (
            <div className="text-xs">
              <h4 className="font-medium mb-1">First errors:</h4>
              <ul className="space-y-1">{previewResult.errors.map((e, i) => <li key={i} className="text-amber-700">Row {e.row}: {e.error}</li>)}</ul>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-medium mb-3">Recent imports</h3>
        <Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Provider</TableHead><TableHead>File</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Matched</TableHead><TableHead className="text-right">Applied</TableHead></TableRow></TableHeader><TableBody>
          {(importsQ.data ?? []).map((j: any) => (
            <TableRow key={j.id}><TableCell className="text-xs">{new Date(j.created_at).toLocaleString()}</TableCell><TableCell>{j.provider}</TableCell><TableCell>{j.filename}</TableCell><TableCell><Badge variant={j.status === "committed" ? "default" : "secondary"}>{j.status}</Badge></TableCell><TableCell className="text-right">{j.matched_rows}/{j.total_rows}</TableCell><TableCell className="text-right">{j.applied_rows}</TableCell></TableRow>
          ))}
          {(importsQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No imports yet.</TableCell></TableRow>}
        </TableBody></Table>
      </Card>
    </AppShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "good" | "warn" }) {
  const color = accent === "good" ? "text-emerald-600" : accent === "warn" ? "text-amber-600" : "";
  return <div className="border rounded p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-2xl font-semibold ${color}`}>{value}</div></div>;
}
