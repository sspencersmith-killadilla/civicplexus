import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireHrAdmin } from "@/lib/role-check.server";
import { z } from "zod";

export type HistoryEvent = {
  at: string;
  category:
    | "hire"
    | "status"
    | "compensation"
    | "paf"
    | "review"
    | "training"
    | "provisioning"
    | "grievance"
    | "audit";
  title: string;
  detail?: string | null;
  actor?: string | null;
  ref?: { kind: string; id: string } | null;
  meta?: Record<string, string | number | boolean | null> | null;
  attachments?: HistoryAttachment[];
};

export type HistoryAttachment = {
  id: string;
  bucket: string;
  path: string;
  title: string;
  mime?: string | null;
  size?: number | null;
  sensitive?: boolean;
};

export const getEmployeeHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ employee_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<HistoryEvent[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Allow access if HR admin OR the employee themselves
    const { data: hr } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "hr_admin").maybeSingle();
    const isHr = !!hr;
    if (!isHr) {
      const { data: own } = await supabaseAdmin.from("employees").select("id").eq("id", data.employee_id).eq("user_id", context.userId).maybeSingle();
      if (!own) throw new Error("Forbidden");
    }
    const empId = data.employee_id;
    const events: HistoryEvent[] = [];

    const actorIds = new Set<string>();
    const collect = (id?: string | null) => { if (id) actorIds.add(id); };

    const [emp, comp, pafs, reviews, training, prov, griev, audit] = await Promise.all([
      supabaseAdmin.from("employees").select("id,first_name,last_name,start_date,status,created_at,created_by").eq("id", empId).maybeSingle(),
      supabaseAdmin.from("employee_comp").select("id,effective_date,base_annual,hourly_rate,source,change_reason,currency,pay_grade_id,created_by,created_at,pay_grades(code,name)").eq("employee_id", empId).order("effective_date", { ascending: false }),
      supabaseAdmin.from("personnel_actions").select("id,paf_number,action_type,status,effective_date,reason,initiated_by,created_at").eq("employee_id", empId),
      supabaseAdmin.from("performance_reviews").select("id,status,review_period_start,review_period_end,overall_rating,finalized_at,created_at,created_by,manager_user_id").eq("employee_id", empId),
      supabaseAdmin.from("employee_training").select("id,status,due_date,completed_at,assigned_at,assigned_by,courses(name,code)").eq("employee_id", empId),
      supabaseAdmin.from("provisioning_events").select("id,direction,action,status,error,created_at,processed_at").eq("employee_id", empId),
      supabaseAdmin.from("grievances").select("id,case_number,category,severity,status,summary,created_at,resolved_at,submitted_by").eq("subject_employee_id", empId),
      supabaseAdmin.from("audit_events").select("id,action,entity,entity_id,diff,actor_id,created_at").eq("entity", "employee").eq("entity_id", empId).order("created_at", { ascending: false }).limit(500),
    ]);

    const pafIds = (pafs.data ?? []).map((p) => p.id);
    const pafAudit = pafIds.length
      ? await supabaseAdmin.from("paf_audit").select("id,paf_id,actor_id,event_type,from_status,to_status,notes,created_at").in("paf_id", pafIds).order("created_at", { ascending: false })
      : { data: [] as Array<{ id: string; paf_id: string; actor_id: string | null; event_type: string; from_status: string | null; to_status: string | null; notes: string | null; created_at: string }> };

    const pafById = new Map((pafs.data ?? []).map((p) => [p.id, p]));

    // Fetch employee documents + certification doc joins for attachment surfacing
    const [docs, certs] = await Promise.all([
      supabaseAdmin.from("documents").select("id,kind,title,storage_path,mime_type,size_bytes,task_instance_id,is_sensitive,created_at").eq("employee_id", empId),
      supabaseAdmin.from("employee_certifications").select("id,document_id,documents:documents!employee_certifications_document_id_fkey(id,title,storage_path,mime_type,size_bytes,is_sensitive)").eq("employee_id", empId),
    ]);
    type DocRow = { id: string; kind: string | null; title: string | null; storage_path: string; mime_type: string | null; size_bytes: number | null; task_instance_id: string | null; is_sensitive: boolean | null };
    const docRows: DocRow[] = (docs.data ?? []) as DocRow[];
    const toAttachment = (d: { id: string; title: string | null; storage_path: string; mime_type: string | null; size_bytes: number | null; is_sensitive?: boolean | null }, bucket = "onboarding-documents"): HistoryAttachment => ({
      id: d.id, bucket, path: d.storage_path, title: d.title ?? d.storage_path.split("/").pop() ?? "document",
      mime: d.mime_type, size: d.size_bytes, sensitive: !!d.is_sensitive,
    });

    if (emp.data) {
      collect(emp.data.created_by);
      events.push({
        at: emp.data.start_date ?? emp.data.created_at,
        category: "hire",
        title: "Employee record created",
        detail: emp.data.start_date ? `Start date ${emp.data.start_date}` : null,
        actor: emp.data.created_by,
        ref: { kind: "employee", id: emp.data.id },
      });
    }

    (comp.data ?? []).forEach((c) => {
      collect(c.created_by);
      const pg = (c as unknown as { pay_grades?: { code?: string; name?: string } }).pay_grades;
      const amount = c.base_annual ? `$${Number(c.base_annual).toLocaleString()} ${c.currency}/yr`
        : c.hourly_rate ? `$${c.hourly_rate}/hr` : "—";
      events.push({
        at: c.effective_date,
        category: "compensation",
        title: `Compensation: ${c.source}${pg?.code ? ` · grade ${pg.code}` : ""}`,
        detail: `${amount}${c.change_reason ? ` — ${c.change_reason}` : ""}`,
        actor: c.created_by,
        ref: { kind: "employee_comp", id: c.id },
        meta: { source: c.source, base_annual: c.base_annual ?? null, hourly_rate: c.hourly_rate ?? null },
      });
    });

    (pafs.data ?? []).forEach((p) => {
      collect(p.initiated_by);
      const number = p.paf_number ?? "";
      const pafDocs = docRows.filter((d) =>
        (d.kind && /paf/i.test(d.kind)) || (number && d.title && d.title.includes(number))
      ).map((d) => toAttachment(d));
      events.push({
        at: p.created_at,
        category: "paf",
        title: `PAF ${p.paf_number ?? ""} created · ${p.action_type.replace(/_/g, " ")}`,
        detail: `Effective ${p.effective_date}${p.reason ? ` — ${p.reason}` : ""}`,
        actor: p.initiated_by,
        ref: { kind: "paf", id: p.id },
        attachments: pafDocs.length ? pafDocs : undefined,
      });
    });
    (pafAudit.data ?? []).forEach((a) => {
      collect(a.actor_id);
      const paf = pafById.get(a.paf_id);
      const label = a.event_type.replace(/_/g, " ");
      const trans = a.from_status && a.to_status ? `: ${a.from_status} → ${a.to_status}` : "";
      events.push({
        at: a.created_at,
        category: "paf",
        title: `PAF ${paf?.paf_number ?? ""} ${label}${trans}`,
        detail: a.notes,
        actor: a.actor_id,
        ref: { kind: "paf", id: a.paf_id },
      });
    });

    (reviews.data ?? []).forEach((r) => {
      collect(r.created_by); collect(r.manager_user_id);
      events.push({
        at: r.created_at,
        category: "review",
        title: `Performance review created (${r.review_period_start} → ${r.review_period_end})`,
        actor: r.created_by,
        ref: { kind: "review", id: r.id },
      });
      if (r.finalized_at) {
        events.push({
          at: r.finalized_at,
          category: "review",
          title: `Performance review finalized${r.overall_rating ? ` · rating ${r.overall_rating}` : ""}`,
          actor: r.manager_user_id,
          ref: { kind: "review", id: r.id },
        });
      }
    });

    (training.data ?? []).forEach((t) => {
      collect(t.assigned_by);
      const course = (t as unknown as { courses?: { name?: string; code?: string } }).courses;
      const label = course?.name ?? course?.code ?? "Course";
      const evidence = (t as unknown as { evidence_path?: string | null }).evidence_path;
      const trainingAtt: HistoryAttachment[] = evidence
        ? [{ id: `training-${t.id}`, bucket: "onboarding-documents", path: evidence, title: `${label} — evidence`, mime: null, size: null }]
        : [];
      events.push({
        at: t.assigned_at,
        category: "training",
        title: `Training assigned: ${label}`,
        detail: t.due_date ? `Due ${t.due_date}` : null,
        actor: t.assigned_by,
        ref: { kind: "training", id: t.id },
      });
      if (t.completed_at) {
        events.push({
          at: t.completed_at,
          category: "training",
          title: `Training completed: ${label}`,
          ref: { kind: "training", id: t.id },
          attachments: trainingAtt.length ? trainingAtt : undefined,
        });
      }
    });

    // Surface certification documents as separate training-category attachments
    (certs.data ?? []).forEach((ec) => {
      const d = (ec as unknown as { documents?: { id: string; title: string | null; storage_path: string; mime_type: string | null; size_bytes: number | null; is_sensitive: boolean | null } | null }).documents;
      if (!d) return;
      events.push({
        at: (ec as unknown as { created_at: string }).created_at ?? new Date().toISOString(),
        category: "training",
        title: `Certification document on file`,
        detail: d.title,
        ref: { kind: "certification", id: (ec as { id: string }).id },
        attachments: [toAttachment(d)],
      });
    });

    (prov.data ?? []).forEach((p) => {
      events.push({
        at: p.processed_at ?? p.created_at,
        category: "provisioning",
        title: `Provisioning ${p.direction} · ${p.action} · ${p.status}`,
        detail: p.error,
        ref: { kind: "provisioning", id: p.id },
      });
    });

    (griev.data ?? []).forEach((g) => {
      collect(g.submitted_by);
      events.push({
        at: g.created_at,
        category: "grievance",
        title: `Grievance ${g.case_number ?? ""} filed · ${g.category} (${g.severity})`,
        detail: g.summary,
        actor: g.submitted_by,
        ref: { kind: "grievance", id: g.id },
      });
      if (g.resolved_at) {
        events.push({
          at: g.resolved_at,
          category: "grievance",
          title: `Grievance ${g.case_number ?? ""} resolved`,
          ref: { kind: "grievance", id: g.id },
        });
      }
    });

    (audit.data ?? []).forEach((a) => {
      collect(a.actor_id);
      const diff = (a.diff ?? {}) as Record<string, unknown>;
      let title = a.action.replace(/_/g, " ");
      let detail: string | null = null;
      if (a.action === "status_change" && diff.from && diff.to) {
        title = `Status changed: ${diff.from} → ${diff.to}`;
        detail = (diff.note as string) ?? null;
      } else if (a.action === "comp_change") {
        return; // already captured via employee_comp
      } else if (Object.keys(diff).length) {
        detail = JSON.stringify(diff);
      }
      events.push({
        at: a.created_at,
        category: a.action === "status_change" ? "status" : "audit",
        title,
        detail,
        actor: a.actor_id,
        ref: { kind: "audit", id: a.id },
        meta: null,
      });
    });

    // Resolve actor names
    const actors: Record<string, string> = {};
    if (actorIds.size) {
      const ids = Array.from(actorIds);
      const [emps, profiles] = await Promise.all([
        supabaseAdmin.from("employees").select("user_id,first_name,last_name").in("user_id", ids),
        supabaseAdmin.from("profiles").select("id,full_name,email").in("id", ids),
      ]);
      (emps.data ?? []).forEach((e) => { if (e.user_id) actors[e.user_id] = `${e.first_name} ${e.last_name}`; });
      (profiles.data ?? []).forEach((p) => { if (!actors[p.id]) actors[p.id] = p.full_name ?? p.email ?? p.id; });
    }
    events.forEach((e) => { if (e.actor && actors[e.actor]) e.actor = actors[e.actor]; });

    events.sort((a, b) => (a.at < b.at ? 1 : -1));
    return events;
  });

export const getHistoryAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    employee_id: z.string().uuid(),
    bucket: z.string().min(1),
    path: z.string().min(1),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Authorize: HR admin or the employee
    const { data: hr } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "hr_admin").maybeSingle();
    if (!hr) {
      const { data: own } = await supabaseAdmin.from("employees").select("id").eq("id", data.employee_id).eq("user_id", context.userId).maybeSingle();
      if (!own) throw new Error("Forbidden");
    }
    // Verify the requested path actually belongs to this employee (documents.employee_id or evidence_path on their training)
    const [{ data: docMatch }, { data: trMatch }] = await Promise.all([
      supabaseAdmin.from("documents").select("id").eq("employee_id", data.employee_id).eq("storage_path", data.path).maybeSingle(),
      supabaseAdmin.from("employee_training").select("id").eq("employee_id", data.employee_id).eq("evidence_path", data.path).maybeSingle(),
    ]);
    if (!docMatch && !trMatch) throw new Error("Attachment not found for this employee");
    const { data: signed, error } = await supabaseAdmin.storage.from(data.bucket).createSignedUrl(data.path, 300);
    if (error || !signed) throw new Error(error?.message ?? "Could not sign URL");
    return { url: signed.signedUrl, expires_in: 300 };
  });