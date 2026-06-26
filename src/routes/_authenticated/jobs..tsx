
function BrochurePanel({ requisitionId, currentUrl }: { requisitionId: string; currentUrl: string | null }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["req_detail", requisitionId] });

  async function loadSigned() {
    if (!currentUrl) return;
    const { data } = await supabase.storage.from("careers-brochures").createSignedUrl(currentUrl, 3600);
    setSigned(data?.signedUrl ?? null);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { toast.error("Please upload a PDF file."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("PDF must be 10MB or smaller."); return; }
    setBusy(true);
    try {
      const path = `req-${requisitionId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("careers-brochures").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase.from("job_requisitions").update({ brochure_url: path } as never).eq("id", requisitionId);
      if (updErr) throw updErr;
      if (currentUrl) await supabase.storage.from("careers-brochures").remove([currentUrl]);
      toast.success("Brochure uploaded");
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Upload failed"));
    } finally { setBusy(false); e.target.value = ""; }
  }

  async function onRemove() {
    if (!currentUrl) return;
    setBusy(true);
    try {
      await supabase.storage.from("careers-brochures").remove([currentUrl]);
      const { error } = await supabase.from("job_requisitions").update({ brochure_url: null } as never).eq("id", requisitionId);
      if (error) throw error;
      toast.success("Brochure removed");
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Remove failed"));
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-4 mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Position brochure (PDF)</h3>
          <p className="text-xs text-muted-foreground">Optional. Shown on the public job posting as a download link.</p>
        </div>
      </div>
      {currentUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadSigned}>
            <FileDown className="h-4 w-4 mr-1" /> {signed ? "Refresh link" : "Preview"}
          </Button>
          {signed && (
            <a href={signed} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">Open preview</a>
          )}
          <span className="text-xs text-muted-foreground truncate max-w-[280px]">{currentUrl}</span>
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
            <Trash2 className="h-4 w-4 mr-1" /> Remove
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No brochure uploaded.</p>
      )}
      <div>
        <Label htmlFor="brochure-upload" className="inline-flex items-center gap-2 cursor-pointer">
          <span className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" /> {currentUrl ? "Replace brochure" : "Upload brochure"}
          </span>
        </Label>
        <input id="brochure-upload" type="file" accept="application/pdf" className="hidden" disabled={busy} onChange={onUpload} />
      </div>
    </Card>
  );
}
