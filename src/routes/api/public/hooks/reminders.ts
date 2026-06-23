import { createFileRoute } from "@tanstack/react-router";
import { dispatchTrainingReminders } from "@/lib/training.functions";

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
        const training = await dispatchTrainingReminders();

        // ── Interview reminders (24h before) ───────────────────────────────
        const in24h = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        const in23h = new Date(Date.now() + 23 * 3600 * 1000).toISOString();
        const { data: upcoming } = await supabaseAdmin
          .from("interviews")
          .select("id, scheduled_at, interviewer_ids, location, application_id")
          .gte("scheduled_at", in23h).lte("scheduled_at", in24h);
        const interviewNotifs: Array<{ user_id: string; type: string; title: string; body: string; link: string }> = [];
        for (const iv of (upcoming ?? []) as Array<{ id: string; scheduled_at: string; interviewer_ids: string[] | null; location: string | null }>) {
          for (const uid of iv.interviewer_ids ?? []) {
            interviewNotifs.push({
              user_id: uid, type: "interview", title: "Interview tomorrow",
              body: `${new Date(iv.scheduled_at).toLocaleString()}${iv.location ? ` · ${iv.location}` : ""}`,
              link: `/interviews/${iv.id}`,
            });
          }
        }
        if (interviewNotifs.length) await supabaseAdmin.from("notifications").insert(interviewNotifs);

        // ── Offer expiration (mark expired, notify HR) ─────────────────────
        const nowIso = new Date().toISOString();
        const { data: expired } = await supabaseAdmin
          .from("offers")
          .select("id, application_id, expires_at, created_by")
          .eq("status", "sent")
          .lt("expires_at", nowIso);
        const offerNotifs: Array<{ user_id: string; type: string; title: string; body: string; link: string }> = [];
        for (const o of (expired ?? []) as Array<{ id: string; expires_at: string; created_by: string }>) {
          await supabaseAdmin.from("offers").update({ status: "expired" }).eq("id", o.id);
          offerNotifs.push({
            user_id: o.created_by, type: "offer", title: "Offer expired",
            body: `Offer expired on ${new Date(o.expires_at).toLocaleDateString()} without response`,
            link: "/offers",
          });
        }
        if (offerNotifs.length) await supabaseAdmin.from("notifications").insert(offerNotifs);

        return Response.json({
          ok: true,
          queued: notifications.length,
          training,
          interview_reminders: interviewNotifs.length,
          expired_offers: offerNotifs.length,
        });
      },
    },
  },
});