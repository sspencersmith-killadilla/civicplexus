import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/reminders")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Overdue task reminders
        const today = new Date().toISOString().slice(0, 10);
        const { data: overdue } = await supabaseAdmin
          .from("task_instances")
          .select("id,title,due_date,assignee,onboarding_instances(employees(user_id))")
          .neq("status", "complete")
          .lt("due_date", today)
          .limit(500);
        const notifications: { user_id: string; type: string; title: string; body: string; link: string }[] = [];
        for (const t of (overdue ?? []) as Array<{ title: string; due_date: string | null; assignee: string; onboarding_instances: { employees: { user_id: string | null } | null } | null }>) {
          const uid = t.onboarding_instances?.employees?.user_id;
          if (!uid) continue;
          if (t.assignee !== "employee") continue;
          notifications.push({
            user_id: uid,
            type: "task_overdue",
            title: `Overdue: ${t.title}`,
            body: t.due_date ? `Due ${t.due_date}` : "Past due",
            link: "/preboarding",
          });
        }
        // Cert expiry warnings (30/60/90 days)
        const { data: certs } = await supabaseAdmin
          .from("employee_certifications")
          .select("id,expires_at,employee_id,certifications(name),employees(user_id)")
          .not("expires_at", "is", null);
        const now = Date.now();
        for (const c of (certs ?? []) as Array<{ expires_at: string | null; certifications: { name: string } | null; employees: { user_id: string | null } | null }>) {
          if (!c.expires_at || !c.employees?.user_id) continue;
          const days = Math.floor((new Date(c.expires_at).getTime() - now) / 86400000);
          if ([30, 60, 90].includes(days)) {
            notifications.push({
              user_id: c.employees.user_id,
              type: "cert_expiring",
              title: `Certification expiring in ${days} days`,
              body: c.certifications?.name ?? "Certification",
              link: "/training",
            });
          }
        }
        if (notifications.length) await supabaseAdmin.from("notifications").insert(notifications);
        return Response.json({ ok: true, queued: notifications.length });
      },
    },
  },
});