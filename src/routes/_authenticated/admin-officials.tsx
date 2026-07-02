import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Landmark, Plus, UserPlus, ShieldCheck, XCircle, Coins, Download, Printer } from "lucide-react";
import {
  listBodies, getBody, upsertBody, upsertSeat, upsertOfficial,
  createTerm, swearIn, endTerm, upcomingExpirations, generateMeetingReimbursements,
} from "@/lib/officials.functions";
import { exportClerkRosterCsv } from "@/lib/officials-export.functions";
import { downloadCsv } from "@/lib/download-csv";
import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listBoardApplications, decideBoardApplication, getCoverLetterUrl, exportBoardApplicationsCsv,
} from "@/lib/board-applications.functions";

export const Route = createFileRoute("/_authenticated/admin-officials")({ component: OfficialsAdmin });

type Body = { id: string; slug: string; name: string; kind: string; comp_model: string; roster_public: boolean };

function OfficialsAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBodies);
  const expFn = useServerFn(upcomingExpirations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("bodies");

  const bodiesQ = useQuery({ queryKey: ["officials-bodies"], queryFn: () => listFn() });
  const expQ = useQuery({ queryKey: ["officials-expirations"], queryFn: () => expFn({ data: { days: 120 } }) });
  const bodies = (bodiesQ.data ?? []) as Body[];
  const selected = bodies.find((b) => b.id === selectedId) ?? bodies[0] ?? null;

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-serif tracking-tight flex items-center gap-2">
              <Landmark className="h-6 w-6" /> Elected officials & appointed boards
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage governing bodies, seats, terms, oaths, and public roster visibility.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={async () => {
              const r = await exportClerkRosterCsv({ data: { include_history: false } });
              downloadCsv(r.csv, r.filename);
            }}><Download className="h-4 w-4 mr-1" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={async () => {
              const r = await exportClerkRosterCsv({ data: { include_history: true } });
              downloadCsv(r.csv, r.filename.replace(".csv", "-full-history.csv"));
            }}><Download className="h-4 w-4 mr-1" /> CSV (full history)</Button>
            <Link to="/admin-officials/print"><Button size="sm" variant="outline"><Printer className="h-4 w-4 mr-1" /> PDF</Button></Link>
            <BodyDialog onSaved={() => qc.invalidateQueries({ queryKey: ["officials-bodies"] })} />
          </div>
        </div>

        {(expQ.data?.length ?? 0) > 0 && (
          <Card className="p-4 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
            <p className="text-sm font-medium">Terms expiring in the next 120 days</p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1">
              {(expQ.data as any[]).map((r) => (
                <li key={r.id}>
                  {r.officials?.first_name} {r.officials?.last_name} — {r.official_seats?.official_bodies?.name} · {r.official_seats?.seat_label} → ends {r.end_date}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="bodies">Bodies & seats</TabsTrigger>
            <TabsTrigger value="applications">Applications</TabsTrigger>
          </TabsList>
          <TabsContent value="bodies">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
          <Card className="p-2">
            {bodiesQ.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
            {bodies.length === 0 && !bodiesQ.isLoading && (
              <p className="p-3 text-sm text-muted-foreground">No bodies yet. Create one to begin.</p>
            )}
            <ul>
              {bodies.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => setSelectedId(b.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted ${selected?.id === b.id ? "bg-muted" : ""}`}
                  >
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{b.kind}</span>
                      {b.roster_public && <Badge variant="outline" className="text-[10px]">public</Badge>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {selected ? <BodyDetail bodyId={selected.id} body={selected} /> : <Card className="p-6"><p className="text-sm text-muted-foreground">Select a body to manage.</p></Card>}
        </div>
          </TabsContent>
          <TabsContent value="applications">
            <ApplicationsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function ApplicationsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBoardApplications);
  const decideFn = useServerFn(decideBoardApplication);
  const coverFn = useServerFn(getCoverLetterUrl);
  const expFn = useServerFn(exportBoardApplicationsCsv);
  const q = useQuery({ queryKey: ["board-applications"], queryFn: () => listFn() });
  const rows = (q.data ?? []) as any[];
  const [filter, setFilter] = useState<string>("all");
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Board applications</h3>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all","submitted","under_review","shortlisted","approved","declined","withdrawn"].map((s) =>
                <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={async () => {
          const r = await expFn(); downloadCsv(r.csv, r.filename);
        }}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
      </div>
      {q.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!q.isLoading && shown.length === 0 && <p className="text-xs text-muted-foreground">No applications.</p>}
      <ul className="divide-y">
        {shown.map((r) => {
          const primary = (r.board_application_interests ?? []).find((i: any) => i.is_primary);
          const others = (r.board_application_interests ?? []).filter((i: any) => !i.is_primary);
          return (
            <li key={r.id} className="py-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{r.first_name} {r.last_name} <span className="text-xs text-muted-foreground">· {r.email}</span></div>
                  <div className="text-xs text-muted-foreground">
                    Primary: {primary?.official_bodies?.name ?? "—"}
                    {others.length > 0 && ` · Also: ${others.map((o: any) => o.official_bodies?.name).filter(Boolean).join(", ")}`}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Submitted {new Date(r.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{r.status}</Badge>
                </div>
              </div>
              {r.statement && <p className="text-xs whitespace-pre-wrap border-l-2 border-primary/40 pl-2">{r.statement}</p>}
              <div className="flex items-center gap-2 flex-wrap">
                {r.cover_letter_path && (
                  <Button size="sm" variant="outline" onClick={async () => {
                    const { url } = await coverFn({ data: { path: r.cover_letter_path } });
                    window.open(url, "_blank");
                  }}>Open cover letter</Button>
                )}
                {["under_review","shortlisted","approved","declined"].map((s) => (
                  <Button key={s} size="sm" variant={s === "approved" ? "default" : "outline"} onClick={async () => {
                    await decideFn({ data: { id: r.id, status: s as any } });
                    toast.success(`Marked ${s}`);
                    qc.invalidateQueries({ queryKey: ["board-applications"] });
                  }}>{s}</Button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function BodyDialog({ onSaved, existing }: { onSaved: () => void; existing?: any }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(existing ?? {
    slug: "", name: "", kind: "board", comp_model: "unpaid",
    fixed_stipend_amount: null, fixed_stipend_period: null, per_meeting_amount: null,
    chair_bonus_amount: null, per_diem_amount: null, pay_absent: false,
    meeting_cadence: "", description: "", roster_public: true, sort_order: 100,
  });
  const fn = useServerFn(upsertBody);
  const m = useMutation({
    mutationFn: () => fn({ data: {
      ...form,
      fixed_stipend_amount: form.fixed_stipend_amount ? Number(form.fixed_stipend_amount) : null,
      per_meeting_amount: form.per_meeting_amount ? Number(form.per_meeting_amount) : null,
      chair_bonus_amount: form.chair_bonus_amount ? Number(form.chair_bonus_amount) : null,
      per_diem_amount: form.per_diem_amount ? Number(form.per_diem_amount) : null,
      pay_absent: !!form.pay_absent,
    } }),
    onSuccess: () => { toast.success("Saved"); setOpen(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> {existing ? "Edit body" : "New body"}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{existing ? "Edit" : "Create"} governing body</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Slug</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
            <div><Label>Sort order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
          </div>
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Kind</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["council","board","commission","authority","committee"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Compensation model</Label>
              <Select value={form.comp_model} onValueChange={(v) => setForm({ ...form, comp_model: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["unpaid","fixed_stipend","per_meeting","mixed"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(form.comp_model === "fixed_stipend" || form.comp_model === "mixed") && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Stipend amount</Label><Input type="number" value={form.fixed_stipend_amount ?? ""} onChange={(e) => setForm({ ...form, fixed_stipend_amount: e.target.value })} /></div>
              <div><Label>Period</Label>
                <Select value={form.fixed_stipend_period ?? ""} onValueChange={(v) => setForm({ ...form, fixed_stipend_period: v })}>
                  <SelectTrigger><SelectValue placeholder="…" /></SelectTrigger>
                  <SelectContent>
                    {["monthly","annual","per_pay_period"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {(form.comp_model === "per_meeting" || form.comp_model === "mixed") && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Per-meeting amount</Label><Input type="number" value={form.per_meeting_amount ?? ""} onChange={(e) => setForm({ ...form, per_meeting_amount: e.target.value })} /></div>
                <div><Label>Chair bonus (per meeting)</Label><Input type="number" value={form.chair_bonus_amount ?? ""} onChange={(e) => setForm({ ...form, chair_bonus_amount: e.target.value })} /></div>
              </div>
            </>
          )}
          {form.comp_model !== "unpaid" && (
            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <div><Label>Per-diem / travel (per meeting)</Label><Input type="number" value={form.per_diem_amount ?? ""} onChange={(e) => setForm({ ...form, per_diem_amount: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-xs pb-2"><Switch checked={!!form.pay_absent} onCheckedChange={(v) => setForm({ ...form, pay_absent: v })} /> Pay when absent</label>
            </div>
          )}
          <div><Label>Meeting cadence</Label><Input value={form.meeting_cadence ?? ""} onChange={(e) => setForm({ ...form, meeting_cadence: e.target.value })} placeholder="e.g. 1st & 3rd Tuesday, 6:00 pm" /></div>
          <div><Label>Description</Label><Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label>Publish on public roster</Label>
            <Switch checked={!!form.roster_public} onCheckedChange={(v) => setForm({ ...form, roster_public: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BodyDetail({ bodyId, body }: { bodyId: string; body: Body }) {
  const qc = useQueryClient();
  const fn = useServerFn(getBody);
  const q = useQuery({ queryKey: ["official-body", bodyId], queryFn: () => fn({ data: { body_id: bodyId } }) });
  const seats = q.data?.seats ?? [];
  const terms = q.data?.terms ?? [];
  const activeTermsBySeat = new Map<string, any>();
  for (const t of terms as any[]) if (t.status === "active") activeTermsBySeat.set(t.seat_id, t);
  const refresh = () => qc.invalidateQueries({ queryKey: ["official-body", bodyId] });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-medium text-lg">{body.name}</h2>
              <Badge variant="outline" className="text-[10px]">{body.kind}</Badge>
              {body.roster_public && <Badge variant="outline" className="text-[10px]">public</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Compensation: {body.comp_model}</p>
          </div>
          <div className="flex gap-2">
            <BodyDialog onSaved={() => { qc.invalidateQueries({ queryKey: ["officials-bodies"] }); refresh(); }} existing={{ ...body, ...(q.data?.body ?? {}) }} />
            <SeatDialog bodyId={bodyId} onSaved={refresh} />
            <GenerateReimbDialog bodyId={bodyId} />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Seats & current holders</h3>
        {seats.length === 0 && <p className="text-xs text-muted-foreground">No seats yet.</p>}
        <ul className="divide-y">
          {seats.map((s: any) => {
            const t = activeTermsBySeat.get(s.id);
            return (
              <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{s.seat_label}{s.is_chair ? " · Chair" : ""}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.appointing_authority ? `Appointed by ${s.appointing_authority} · ` : ""}
                    {s.term_length_months ? `${s.term_length_months} mo terms` : "—"}
                  </div>
                </div>
                <div className="text-right">
                  {t ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{t.officials?.first_name} {t.officials?.last_name}</span>
                      <Badge variant="secondary" className="text-[10px]">{t.status}</Badge>
                      <EndTermButton termId={t.id} onDone={refresh} />
                    </div>
                  ) : (
                    <AssignHolderButton seatId={s.id} onDone={refresh} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Term history</h3>
        {terms.length === 0 && <p className="text-xs text-muted-foreground">No terms recorded.</p>}
        <ul className="text-xs space-y-1">
          {(terms as any[]).map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
              <span>{t.officials?.first_name} {t.officials?.last_name}</span>
              <span className="text-muted-foreground">· {t.official_seats?.seat_label}</span>
              <span className="text-muted-foreground">· {t.start_date} → {t.end_date ?? "present"}</span>
              {t.status === "pending" && <SwearInButton termId={t.id} onDone={refresh} />}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function SeatDialog({ bodyId, onSaved }: { bodyId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ body_id: bodyId, seat_label: "", seat_number: null, is_chair: false, is_ex_officio: false, term_length_months: 24, appointing_authority: "" });
  const fn = useServerFn(upsertSeat);
  const m = useMutation({
    mutationFn: () => fn({ data: { ...form, seat_number: form.seat_number ? Number(form.seat_number) : null, term_length_months: form.term_length_months ? Number(form.term_length_months) : null } }),
    onSuccess: () => { toast.success("Seat added"); setOpen(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Seat</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add seat</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Label</Label><Input value={form.seat_label} onChange={(e) => setForm({ ...form, seat_label: e.target.value })} placeholder="e.g. Place 3" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Number</Label><Input type="number" value={form.seat_number ?? ""} onChange={(e) => setForm({ ...form, seat_number: e.target.value })} /></div>
            <div><Label>Term length (mo)</Label><Input type="number" value={form.term_length_months ?? ""} onChange={(e) => setForm({ ...form, term_length_months: e.target.value })} /></div>
          </div>
          <div><Label>Appointing authority</Label><Input value={form.appointing_authority ?? ""} onChange={(e) => setForm({ ...form, appointing_authority: e.target.value })} placeholder="e.g. Mayor / Council" /></div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_chair} onCheckedChange={(v) => setForm({ ...form, is_chair: v })} /> Chair</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_ex_officio} onCheckedChange={(v) => setForm({ ...form, is_ex_officio: v })} /> Ex-officio</label>
          </div>
        </div>
        <DialogFooter><Button onClick={() => m.mutate()} disabled={m.isPending}>Save seat</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignHolderButton({ seatId, onDone }: { seatId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    first_name: "", last_name: "", email: "", phone: "", bio: "",
    publish_contact: false, publish_photo: false, publish_bio: true,
    appointment_type: "appointed", start_date: new Date().toISOString().slice(0, 10), end_date: "",
    appointing_authority: "",
  });
  const upsertPerson = useServerFn(upsertOfficial);
  const createT = useServerFn(createTerm);
  const m = useMutation({
    mutationFn: async () => {
      const { id } = await upsertPerson({ data: {
        first_name: form.first_name, last_name: form.last_name, email: form.email || null,
        phone: form.phone || null, bio: form.bio || null,
        publish_contact: form.publish_contact, publish_photo: form.publish_photo, publish_bio: form.publish_bio,
      } });
      await createT({ data: {
        official_id: id, seat_id: seatId, appointment_type: form.appointment_type,
        start_date: form.start_date, end_date: form.end_date || null,
        appointing_authority: form.appointing_authority || null,
      } });
      return { id };
    },
    onSuccess: () => { toast.success("Term created (pending oath)"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><UserPlus className="h-3 w-3 mr-1" /> Assign holder</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Assign holder</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First name</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><Label>Last name</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div><Label>Bio</Label><Textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <label className="flex items-center gap-2"><Switch checked={form.publish_bio} onCheckedChange={(v) => setForm({ ...form, publish_bio: v })} /> Publish bio</label>
            <label className="flex items-center gap-2"><Switch checked={form.publish_photo} onCheckedChange={(v) => setForm({ ...form, publish_photo: v })} /> Publish photo</label>
            <label className="flex items-center gap-2"><Switch checked={form.publish_contact} onCheckedChange={(v) => setForm({ ...form, publish_contact: v })} /> Publish contact</label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Appointment</Label>
              <Select value={form.appointment_type} onValueChange={(v) => setForm({ ...form, appointment_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["elected","appointed","ex_officio"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><Label>End</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          </div>
          <div><Label>Appointing authority</Label><Input value={form.appointing_authority} onChange={(e) => setForm({ ...form, appointing_authority: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={() => m.mutate()} disabled={m.isPending}>Create pending term</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwearInButton({ termId, onDone }: { termId: string; onDone: () => void }) {
  const fn = useServerFn(swearIn);
  const m = useMutation({
    mutationFn: () => fn({ data: { term_id: termId } }),
    onSuccess: () => { toast.success("Sworn in — term active"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}><ShieldCheck className="h-3 w-3 mr-1" /> Swear in</Button>;
}

function EndTermButton({ termId, onDone }: { termId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"expired" | "resigned" | "removed">("expired");
  const [reason, setReason] = useState("");
  const fn = useServerFn(endTerm);
  const m = useMutation({
    mutationFn: () => fn({ data: { term_id: termId, status, ended_reason: reason || null } }),
    onSuccess: () => { toast.success("Term ended"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost"><XCircle className="h-3 w-3 mr-1" /> End</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>End term</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Reason type</Label>
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="resigned">Resigned</SelectItem>
                <SelectItem value="removed">Removed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={() => m.mutate()} disabled={m.isPending}>Confirm</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateReimbDialog({ bodyId }: { bodyId: string }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(last);
  const fn = useServerFn(generateMeetingReimbursements);
  const m = useMutation({
    mutationFn: () => fn({ data: { body_id: bodyId, from, to } }),
    onSuccess: (r) => {
      toast.success(`Generated ${r.created} reimbursement${r.created === 1 ? "" : "s"} (${r.skipped} skipped)`);
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Coins className="h-4 w-4 mr-1" /> Generate pay</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Generate reimbursements from attendance</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Creates draft reimbursement records for every attended meeting in the range, using this body's per-meeting amount, chair bonus, and per-diem rules. Existing records for the same meeting are skipped.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Generating…" : "Generate"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}