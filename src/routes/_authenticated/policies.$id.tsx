import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/policies/$id")({ component: PolicyDetail });

function PolicyDetail() {
  const { id } = useParams({ from: "/_authenticated/policies/$id" });
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: policy } = useQuery({ queryKey: ["policy", id], queryFn: async () => (await supabase.from("policies").select("*").eq("id", id).maybeSingle()).data });
  const { data: acks } = useQuery({ queryKey: ["acks", id], queryFn: async () => (await supabase.from("policy_acknowledgments").select("*").eq("policy_id", id)).data ?? [] });

  const ack = useMutation({
    mutationFn: async () => {
      if (!user?.user || !policy) throw new Error("Not ready");
      const { data: emp } = await supabase.from("employees").select("id").eq("personal_email", user.user.email!).maybeSingle();
      if (!emp) throw new Error("No employee record");
      const { error } = await supabase.from("policy_acknowledgments").insert({ policy_id: id, employee_id: emp.id, user_id: user.user.id, version: policy.version });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Acknowledged"); qc.invalidateQueries({ queryKey: ["acks", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const myAck = acks?.find((a) => a.user_id === user?.user.id);

  return (
    <AppShell title={policy?.title ?? "Policy"}>
      <Card className="p-6 max-w-3xl">
        <p className="text-xs text-muted-foreground mb-4">v{policy?.version} effective {policy?.effective_date}</p>
        <pre className="whitespace-pre-wrap font-sans text-sm">{policy?.body_md}</pre>
        <div className="mt-6 pt-6 border-t">
          {myAck ? (
            <p className="text-sm text-emerald-600">Acknowledged on {new Date(myAck.acknowledged_at).toLocaleString()}</p>
          ) : (
            <Button onClick={() => ack.mutate()}>I acknowledge this policy</Button>
          )}
          <p className="text-xs text-muted-foreground mt-4">{acks?.length ?? 0} acknowledgment(s) total</p>
        </div>
      </Card>
    </AppShell>
  );
}