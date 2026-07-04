import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { createTeam } from "@/lib/teams.functions";

export const Route = createFileRoute("/_authenticated/teams/new")({
  component: NewTeam,
});

function NewTeam() {
  const navigate = useNavigate();
  const create = useServerFn(createTeam);

  const employeesQ = useQuery({
    queryKey: ["employees_for_teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees")
        .select("id, first_name, last_name, department").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ name: "", purpose: "", sponsor_employee_id: "", target_end_date: "" });

  const mut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Team name required");
      return await create({ data: {
        name: form.name.trim(),
        purpose: form.purpose || undefined,
        sponsor_employee_id: form.sponsor_employee_id || null,
        target_end_date: form.target_end_date || null,
      } });
    },
    onSuccess: (r) => {
      toast.success("Team created");
      navigate({ to: "/teams/$id", params: { id: r.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <AppShell title="New Cross-Functional Team">
      <Card className="p-6 max-w-2xl space-y-4">
        <div className="space-y-1.5">
          <Label>Team name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="AI Evaluation Team" />
        </div>
        <div className="space-y-1.5">
          <Label>Purpose (one-liner)</Label>
          <Textarea rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Evaluate AI tools for city operations and recommend a rollout plan." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Sponsor</Label>
            <Select value={form.sponsor_employee_id} onValueChange={(v) => setForm({ ...form, sponsor_employee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Executive sponsor…" /></SelectTrigger>
              <SelectContent>
                {(employeesQ.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.department ? ` · ${e.department}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Target end date</Label>
            <Input type="date" value={form.target_end_date} onChange={(e) => setForm({ ...form, target_end_date: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">You'll be added as the team lead. You can fill in the full charter, add members, and set goals from the team workspace.</p>
        <div className="flex gap-2 pt-2">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Creating…" : "Create team"}</Button>
          <Button variant="outline" onClick={() => navigate({ to: "/teams" })}>Cancel</Button>
        </div>
      </Card>
    </AppShell>
  );
}