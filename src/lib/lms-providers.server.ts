/**
 * LMS provider adapters (server-only).
 * Each adapter normalizes completions into { email, external_course_id, course_name, completed_at, score?, evidence_url? }.
 */

export type LmsCompletion = {
  email: string;
  external_course_id: string;
  course_name: string;
  completed_at: string; // ISO
  score?: number;
  evidence_url?: string;
};

export type LmsProviderKind = "chamilo" | "moodle" | "forma";

export type LmsConnectionConfig = {
  provider: LmsProviderKind;
  base_url: string;
  auth_kind: "api_key" | "oauth2" | "basic";
  username?: string | null;
  secret: string; // resolved from project secrets
};

export interface LmsProvider {
  testConnection(cfg: LmsConnectionConfig): Promise<{ ok: boolean; message: string }>;
  fetchCompletions(cfg: LmsConnectionConfig, sinceIso: string | null): Promise<LmsCompletion[]>;
}

function trimUrl(u: string) {
  return u.replace(/\/+$/, "");
}

/* ------------------------------ Moodle ------------------------------ */
// Moodle Web Services REST: /webservice/rest/server.php?wstoken=...&wsfunction=...&moodlewsrestformat=json

async function moodleCall<T>(cfg: LmsConnectionConfig, fn: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${trimUrl(cfg.base_url)}/webservice/rest/server.php`);
  url.searchParams.set("wstoken", cfg.secret);
  url.searchParams.set("wsfunction", fn);
  url.searchParams.set("moodlewsrestformat", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Moodle ${fn} HTTP ${res.status}`);
  const j = (await res.json()) as unknown;
  if (j && typeof j === "object" && "exception" in (j as Record<string, unknown>)) {
    throw new Error(`Moodle ${fn}: ${(j as { message?: string }).message ?? "error"}`);
  }
  return j as T;
}

const moodleProvider: LmsProvider = {
  async testConnection(cfg) {
    try {
      await moodleCall(cfg, "core_webservice_get_site_info");
      return { ok: true, message: "Connected to Moodle" };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  },
  async fetchCompletions(cfg, sinceIso) {
    const sinceEpoch = sinceIso ? Math.floor(new Date(sinceIso).getTime() / 1000) : 0;
    const courses = await moodleCall<Array<{ id: number; shortname: string; fullname: string }>>(
      cfg,
      "core_course_get_courses",
    );
    const out: LmsCompletion[] = [];
    for (const course of courses) {
      if (course.id === 1) continue; // site course
      let users: Array<{ id: number; email: string }> = [];
      try {
        users = await moodleCall(cfg, "core_enrol_get_enrolled_users", { courseid: String(course.id) });
      } catch {
        continue;
      }
      for (const u of users) {
        try {
          const status = await moodleCall<{ completionstatus?: { completed: boolean; timecompleted?: number } }>(
            cfg,
            "core_completion_get_course_completion_status",
            { courseid: String(course.id), userid: String(u.id) },
          );
          const cs = status.completionstatus;
          if (cs?.completed && cs.timecompleted && cs.timecompleted > sinceEpoch) {
            out.push({
              email: u.email,
              external_course_id: course.shortname || String(course.id),
              course_name: course.fullname,
              completed_at: new Date(cs.timecompleted * 1000).toISOString(),
            });
          }
        } catch {
          // per-user completion may be disabled; skip
        }
      }
    }
    return out;
  },
};

/* ------------------------------ Chamilo ------------------------------ */
// Chamilo REST v2: POST {base}/main/webservices/api/v2.php action=<name>&api_key=...&username=...

async function chamiloCall<T>(cfg: LmsConnectionConfig, action: string, params: Record<string, string> = {}): Promise<T> {
  const body = new URLSearchParams({ action, api_key: cfg.secret, ...(cfg.username ? { username: cfg.username } : {}), ...params });
  const res = await fetch(`${trimUrl(cfg.base_url)}/main/webservices/api/v2.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Chamilo ${action} HTTP ${res.status}`);
  const j = (await res.json()) as { error?: boolean; message?: string; data?: unknown };
  if (j.error) throw new Error(`Chamilo ${action}: ${j.message ?? "error"}`);
  return (j.data ?? j) as T;
}

const chamiloProvider: LmsProvider = {
  async testConnection(cfg) {
    try {
      await chamiloCall(cfg, "user_list");
      return { ok: true, message: "Connected to Chamilo" };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  },
  async fetchCompletions(cfg, sinceIso) {
    const since = sinceIso ? new Date(sinceIso).getTime() : 0;
    const users = await chamiloCall<Array<{ id: string | number; email: string }>>(cfg, "user_list");
    const out: LmsCompletion[] = [];
    for (const u of users) {
      let rows: Array<{ course_code?: string; course_id?: string | number; title?: string; date?: string; completed_at?: string; score?: number }> = [];
      try {
        rows = await chamiloCall(cfg, "user_get_completed_tracked_courses", { user_id: String(u.id) });
      } catch {
        continue;
      }
      for (const r of rows) {
        const iso = r.completed_at || r.date;
        if (!iso) continue;
        const ts = new Date(iso).getTime();
        if (!isFinite(ts) || ts <= since) continue;
        out.push({
          email: u.email,
          external_course_id: r.course_code || String(r.course_id ?? ""),
          course_name: r.title || r.course_code || "Course",
          completed_at: new Date(ts).toISOString(),
          score: typeof r.score === "number" ? r.score : undefined,
        });
      }
    }
    return out;
  },
};

/* ------------------------------ Forma LMS ------------------------------ */
// Forma exposes a JSON REST API under /lms/api/v1 with an API key.

async function formaGet<T>(cfg: LmsConnectionConfig, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${trimUrl(cfg.base_url)}/lms/api/v1/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.auth_kind === "basic" && cfg.username) {
    headers.Authorization = `Basic ${btoa(`${cfg.username}:${cfg.secret}`)}`;
  } else {
    headers.Authorization = `Bearer ${cfg.secret}`;
  }
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`Forma ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}

const formaProvider: LmsProvider = {
  async testConnection(cfg) {
    try {
      await formaGet(cfg, "users", { page: "1", limit: "1" });
      return { ok: true, message: "Connected to Forma LMS" };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  },
  async fetchCompletions(cfg, sinceIso) {
    const params: Record<string, string> = { status: "completed", page: "1", limit: "500" };
    if (sinceIso) params.since = sinceIso;
    type Row = { user_email?: string; email?: string; course_code?: string; course_id?: string | number; course_name?: string; completed_at?: string; date_complete?: string; score?: number };
    const j = await formaGet<{ data?: Row[]; items?: Row[] } | Row[]>(cfg, "report/completion", params);
    const rows: Row[] = Array.isArray(j) ? j : (j.data ?? j.items ?? []);
    return rows
      .map((r) => {
        const iso = r.completed_at || r.date_complete;
        if (!iso) return null;
        return {
          email: (r.user_email || r.email || "").toLowerCase(),
          external_course_id: r.course_code || String(r.course_id ?? ""),
          course_name: r.course_name || r.course_code || "Course",
          completed_at: new Date(iso).toISOString(),
          score: typeof r.score === "number" ? r.score : undefined,
        } as LmsCompletion;
      })
      .filter((c): c is LmsCompletion => !!c && !!c.email);
  },
};

export function getLmsProvider(kind: LmsProviderKind): LmsProvider {
  switch (kind) {
    case "moodle": return moodleProvider;
    case "chamilo": return chamiloProvider;
    case "forma": return formaProvider;
  }
}

/** Shared matcher used by both manual CSV import and auto-sync. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function matchAndApplyCompletions(supabaseAdmin: any, completions: LmsCompletion[]) {
  const empRes = await supabaseAdmin.from("employees").select("id,personal_email,work_email");
  const courseRes = await supabaseAdmin.from("courses").select("id,name,external_course_id");
  const emps = empRes.data ?? [];
  const courses = courseRes.data ?? [];

  let applied = 0, matched = 0;
  const errors: Array<{ row: number; error: string }> = [];
  for (let i = 0; i < completions.length; i++) {
    const c = completions[i];
    const emp = emps.find((e: { personal_email: string | null; work_email: string | null }) => (e.personal_email?.toLowerCase() === c.email.toLowerCase()) || (e.work_email?.toLowerCase() === c.email.toLowerCase()));
    const course = courses.find((k: { name: string; external_course_id: string | null }) => (k.external_course_id && k.external_course_id === c.external_course_id) || (k.name && k.name.toLowerCase() === c.course_name.toLowerCase()));
    if (!emp) { errors.push({ row: i + 1, error: `No employee for ${c.email}` }); continue; }
    if (!course) { errors.push({ row: i + 1, error: `No course for ${c.external_course_id || c.course_name}` }); continue; }
    matched++;
    const { error } = await supabaseAdmin.from("employee_training").upsert({
      employee_id: emp.id,
      course_id: course.id,
      status: "complete",
      completed_at: c.completed_at,
      score: c.score ?? null,
      evidence_path: c.evidence_url ?? null,
    }, { onConflict: "employee_id,course_id" });
    if (!error) applied++;
    else errors.push({ row: i + 1, error: error.message });
  }
  return { fetched: completions.length, matched, applied, errors };
}
