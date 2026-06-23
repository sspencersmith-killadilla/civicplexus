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

        // ── Review cycle reminders ────────────────────────────────────────
        const todayDate = new Date().toISOString().slice(0, 10);
        const { data: dueCycles } = await supabaseAdmin
          .from("review_cycles")
          .select("id, name, status, self_review_due, manager_review_due, signoff_due")
          .in("status", ["open", "in_calibration"]);
        const cycleNotifs: Array<{ user_id: string; type: string; title: string; body: string; link: string }> = [];
        for (const c of (dueCycles ?? []) as Array<{ id: string; name: string; self_review_due: string | null; manager_review_due: string | null; signoff_due: string | null }>) {
          const { data: parts } = await supabaseAdmin
            .from("review_cycle_participants")
            .select("status, review_id, employee:employee_id(user_id, first_name, last_name), manager:manager_id(user_id)")
            .eq("cycle_id", c.id);
          for (const p of (parts ?? []) as unknown as Array<{ status: string; review_id: string | null; employee: { user_id: string | null; first_name: string; last_name: string } | null; manager: { user_id: string | null } | null }>) {
            if (c.self_review_due && c.self_review_due < todayDate && p.status === "not_started" && p.employee?.user_id) {
              cycleNotifs.push({ user_id: p.employee.user_id, type: "review_cycle", title: "Self-assessment overdue", body: c.name, link: `/reviews/${p.review_id ?? ""}` });
            }
            if (c.manager_review_due && c.manager_review_due < todayDate && (p.status === "not_started" || p.status === "self_submitted") && p.manager?.user_id) {
              cycleNotifs.push({ user_id: p.manager.user_id, type: "review_cycle", title: "Manager review overdue", body: `${p.employee?.first_name ?? ""} ${p.employee?.last_name ?? ""}`, link: `/reviews/${p.review_id ?? ""}` });
            }
          }
        }
        if (cycleNotifs.length) await supabaseAdmin.from("notifications").insert(cycleNotifs);

        // ── Goal weekly check-in nudges (Monday only) ─────────────────────
        const weeklyNotifs: Array<{ user_id: string; type: string; title: string; body: string; link: string }> = [];
        if (new Date().getUTCDay() === 1) {
          const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
          const { data: staleGoals } = await supabaseAdmin
            .from("goals")
            .select("id, title, owner_employee_id, employees:owner_employee_id(user_id)")
            .eq("status", "active");
          for (const g of (staleGoals ?? []) as unknown as Array<{ id: string; title: string; owner: { user_id: string | null } | null }>) {
            if (!g.owner?.user_id) continue;
            const { data: last } = await supabaseAdmin
              .from("goal_updates").select("created_at").eq("goal_id", g.id)
              .order("created_at", { ascending: false }).limit(1);
            const lastAt = (last?.[0] as { created_at: string } | undefined)?.created_at;
            if (!lastAt || lastAt < weekAgo) {
              weeklyNotifs.push({ user_id: g.owner.user_id, type: "goal_checkin", title: "Goal check-in", body: g.title, link: "/goals" });
            }
          }
        }
        if (weeklyNotifs.length) await supabaseAdmin.from("notifications").insert(weeklyNotifs);

        // ── Recurring 1:1 auto-create ─────────────────────────────────────
        const horizon = new Date(Date.now() + 7 * 86400000).toISOString();
        const { data: dueRecurring } = await supabaseAdmin
          .from("one_on_ones")
          .select("id, employee_id, manager_user_id, template_id, cadence_weeks, next_scheduled_at, title")
          .not("cadence_weeks", "is", null)
          .lte("next_scheduled_at", horizon);
        let created = 0;
        for (const s of (dueRecurring ?? []) as Array<{ id: string; employee_id: string; manager_user_id: string | null; template_id: string | null; cadence_weeks: number; next_scheduled_at: string; title: string | null }>) {
          const next = new Date(s.next_scheduled_at);
          const after = new Date(next.getTime() + s.cadence_weeks * 7 * 86400000).toISOString();
          // Insert next session (basic clone of parent)
          await supabaseAdmin.from("one_on_ones").insert({
            employee_id: s.employee_id, manager_user_id: s.manager_user_id, template_id: s.template_id,
            title: s.title, status: "scheduled", scheduled_at: s.next_scheduled_at,
          });
          await supabaseAdmin.from("one_on_ones").update({ next_scheduled_at: after }).eq("id", s.id);
          created++;
        }

        return Response.json({
          ok: true,
          queued: notifications.length,
          training,
          interview_reminders: interviewNotifs.length,
          expired_offers: offerNotifs.length,
          cycle_reminders: cycleNotifs.length,
          goal_checkins: weeklyNotifs.length,
          recurring_one_on_ones: created,
        });
      },
    },
  },
});