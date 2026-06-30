import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, useEffect } from "react";
import Tree from "react-d3-tree";
import { toPng } from "html-to-image";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Download, Printer, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { getEmployeePhotoUrl } from "@/lib/employee-photos.functions";
import { getOrgChartDirectory } from "@/lib/employee-directory.functions";

export const Route = createFileRoute("/_authenticated/org-chart")({
  component: OrgChartPage,
});

type Emp = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  department: string | null;
  status: string;
  manager_id: string | null;
  user_id: string | null;
  photo_path: string | null;
  __vacancy?: { position_id: string; title: string };
};

type Node = {
  name: string;
  attributes?: Record<string, string>;
  children?: Node[];
  __emp: Emp;
  __match?: boolean;
  __hiddenCount?: number;
};

function deptColor(dept: string | null): string {
  if (!dept) return "hsl(220 10% 60%)";
  let h = 0;
  for (let i = 0; i < dept.length; i++) h = (h * 31 + dept.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 62% 42%)`;
}

function deptColorSoft(dept: string | null): string {
  if (!dept) return "hsl(220 10% 90%)";
  let h = 0;
  for (let i = 0; i < dept.length; i++) h = (h * 31 + dept.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 60% 94%)`;
}

function initials(e: Emp) {
  return `${e.first_name?.[0] ?? ""}${e.last_name?.[0] ?? ""}`.toUpperCase();
}

// Rank by title keywords — higher score = more senior. Used to pick a
// synthetic root when the data doesn't already converge on one person.
function seniorityScore(e: Emp): number {
  const t = (e.job_title ?? "").toLowerCase();
  if (!t) return 0;
  if (/(city manager|city administrator|town manager|chief executive|^ceo\b|\bceo$)/.test(t)) return 100;
  if (/(mayor|county judge|superintendent)/.test(t)) return 95;
  if (/(assistant city manager|deputy city manager|chief of staff|coo|cfo|cpo|cto)/.test(t)) return 90;
  if (/(director)/.test(t)) return 80;
  if (/(chief)/.test(t)) return 75;
  if (/(department head|head of)/.test(t)) return 70;
  if (/(manager)/.test(t)) return 60;
  if (/(supervisor|lead)/.test(t)) return 50;
  if (/(coordinator|specialist)/.test(t)) return 30;
  return 10;
}

function OrgChartPage() {
  const navigate = useNavigate();
  const photoUrlFn = useServerFn(getEmployeePhotoUrl);
  const directoryFn = useServerFn(getOrgChartDirectory);
  const containerRef = useRef<HTMLDivElement>(null);
  const [translate, setTranslate] = useState({ x: 400, y: 80 });
  const [zoom, setZoom] = useState(0.8);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showVacancies, setShowVacancies] = useState(false);

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: directory, isLoading } = useQuery({
    queryKey: ["org-chart-directory"],
    queryFn: () => directoryFn({ data: {} }),
  });
  const employees = directory?.employees as Emp[] | undefined;
  const positions = directory?.positions ?? [];
  const orgName = directory?.org_name ?? "Organization";

  const filtered = useMemo(() => {
    if (!employees) return [];
    const base = employees.filter((e) => {
      if (!includeInactive && e.status !== "active") return false;
      if (deptFilter !== "all" && e.department !== deptFilter) return false;
      return true;
    });
    if (!showVacancies || !positions || !employees) return base;

    // Map position_id -> employees filling it (from full employees list, not filtered)
    const fillersByPosition = new Map<string, Emp[]>();
    // employees table doesn't include position_id in the select above; re-derive
    // by matching department+title as a heuristic when position_id is absent.
    // We do have position_id on the row via SQL but didn't select it — instead
    // use the count from positions itself: compute filled by matching active
    // employees whose job_title + department equals the position.
    const activeByKey = new Map<string, Emp[]>();
    employees.forEach((e) => {
      if (e.status !== "active" && e.status !== "on_leave" && e.status !== "preboarding") return;
      const key = `${(e.department ?? "").toLowerCase()}|${(e.job_title ?? "").toLowerCase()}`;
      const arr = activeByKey.get(key) ?? [];
      arr.push(e);
      activeByKey.set(key, arr);
    });

    // Resolve "who does this vacancy report to": prefer the employee currently
    // holding the reports_to position; otherwise the most senior active person
    // in the same department; otherwise leave null (root).
    const posById = new Map(positions.map((p) => [p.id, p]));
    const resolveParent = (p: typeof positions[number]): string | null => {
      if (p.reports_to_position_id) {
        const parentPos = posById.get(p.reports_to_position_id);
        if (parentPos) {
          const k = `${(parentPos.department ?? "").toLowerCase()}|${(parentPos.title ?? "").toLowerCase()}`;
          const fillers = activeByKey.get(k) ?? [];
          if (fillers[0]) return fillers[0].id;
        }
      }
      if (p.department) {
        const inDept = employees
          .filter((e) => e.status === "active" && e.department === p.department)
          .sort((a, b) => seniorityScore(b) - seniorityScore(a));
        const head = inDept.find((e) => (e.job_title ?? "").toLowerCase() !== (p.title ?? "").toLowerCase());
        if (head) return head.id;
      }
      return null;
    };

    const vacancyNodes: Emp[] = [];
    for (const p of positions) {
      if (deptFilter !== "all" && p.department !== deptFilter) continue;
      const k = `${(p.department ?? "").toLowerCase()}|${(p.title ?? "").toLowerCase()}`;
      const filled = (activeByKey.get(k) ?? []).length;
      const budgeted = Math.max(1, Math.ceil(Number(p.budgeted_fte ?? 1)));
      let openCount = 0;
      if (p.status === "open") openCount = Math.max(budgeted - filled, budgeted === filled ? 0 : 1);
      else if (budgeted > filled) openCount = budgeted - filled;
      if (openCount <= 0) continue;
      const parentId = resolveParent(p);
      for (let i = 0; i < openCount; i++) {
        vacancyNodes.push({
          id: `vac:${p.id}:${i}`,
          first_name: "Vacant",
          last_name: p.title ?? "Position",
          job_title: p.title ?? null,
          department: p.department ?? null,
          status: "vacant",
          manager_id: parentId,
          user_id: null,
          photo_path: null,
          __vacancy: { position_id: p.id, title: p.title ?? "" },
        });
      }
    }
    return [...base, ...vacancyNodes];
  }, [employees, includeInactive, deptFilter, showVacancies, positions]);

  const departments = useMemo(() => {
    const s = new Set<string>();
    employees?.forEach((e) => e.department && s.add(e.department));
    return Array.from(s).sort();
  }, [employees]);

  const photoPaths = useMemo(
    () => Array.from(new Set(filtered.map((e) => e.photo_path).filter(Boolean) as string[])),
    [filtered],
  );

  const { data: photoMap } = useQuery({
    queryKey: ["org-chart-photos", photoPaths],
    enabled: photoPaths.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const entries = await Promise.all(
        photoPaths.map(async (p) => {
          try {
            const { url } = await photoUrlFn({ data: { path: p } });
            return [p, url] as const;
          } catch {
            return [p, ""] as const;
          }
        }),
      );
      return new Map(entries);
    },
  });

  const tree = useMemo<Node[]>(() => {
    if (!filtered.length) return [];
    const q = search.trim().toLowerCase();
    const byId = new Map<string, Emp>(filtered.map((e) => [e.id, e]));
    // Some records store manager_id as the manager's auth user_id rather than
    // their employees.id. Build a lookup so either form resolves correctly.
    const byUserId = new Map<string, Emp>();
    filtered.forEach((e) => { if (e.user_id) byUserId.set(e.user_id, e); });
    const resolveManagerEmpId = (m: string | null): string | null => {
      if (!m) return null;
      if (byId.has(m)) return m;
      const viaUser = byUserId.get(m);
      return viaUser ? viaUser.id : null;
    };
    const childrenOf = new Map<string | null, Emp[]>();
    filtered.forEach((e) => {
      const k = resolveManagerEmpId(e.manager_id);
      const arr = childrenOf.get(k) ?? [];
      arr.push(e);
      childrenOf.set(k, arr);
    });
    const matchSet = new Set<string>();
    if (q) {
      filtered.forEach((e) => {
        const hay = `${e.first_name} ${e.last_name} ${e.job_title ?? ""} ${e.department ?? ""}`.toLowerCase();
        if (hay.includes(q)) matchSet.add(e.id);
      });
      // include ancestors
      const addAncestors = (id: string) => {
        const e = byId.get(id);
        const mgr = resolveManagerEmpId(e?.manager_id ?? null);
        if (mgr && !matchSet.has(mgr)) {
          matchSet.add(mgr);
          addAncestors(mgr);
        }
      };
      Array.from(matchSet).forEach(addAncestors);
    }
    const countDescendants = (id: string): number => {
      const kids = childrenOf.get(id) ?? [];
      let n = 0;
      for (const k of kids) {
        if (q && !matchSet.has(k.id)) continue;
        n += 1 + countDescendants(k.id);
      }
      return n;
    };
    const build = (e: Emp): Node => {
      const rawKids = (childrenOf.get(e.id) ?? []).filter((c) => !q || matchSet.has(c.id));
      const isCollapsed = collapsed.has(e.id) && rawKids.length > 0;
      const kids = isCollapsed ? [] : rawKids.map(build);
      return {
        name: `${e.first_name} ${e.last_name}`,
        attributes: { title: e.job_title ?? "", dept: e.department ?? "" },
        children: kids.length ? kids : undefined,
        __emp: e,
        __match: q ? matchSet.has(e.id) && `${e.first_name} ${e.last_name} ${e.job_title ?? ""} ${e.department ?? ""}`.toLowerCase().includes(q) : false,
        __hiddenCount: isCollapsed ? countDescendants(e.id) : 0,
      };
    };
    const roots = (childrenOf.get(null) ?? []).filter((r) => !q || matchSet.has(r.id)).map(build);
    // Promote the most senior root to be the single top of the chart, and
    // re-parent any other orphans under them so the org converges.
    if (roots.length > 1) {
      const sorted = [...roots].sort((a, b) => {
        const sa = seniorityScore(a.__emp);
        const sb = seniorityScore(b.__emp);
        if (sa !== sb) return sb - sa;
        return `${a.__emp.last_name} ${a.__emp.first_name}`.localeCompare(
          `${b.__emp.last_name} ${b.__emp.first_name}`,
        );
      });
      const top = sorted[0];
      const rest = sorted.slice(1);
      top.children = [...(top.children ?? []), ...rest];
      return [top];
    }
    return roots;
  }, [filtered, search, collapsed]);

  // Helpers to collapse to a given depth from roots
  const managerIds = useMemo(() => {
    if (!filtered.length) return [] as string[];
    const byId = new Map(filtered.map((e) => [e.id, e]));
    const byUserId = new Map<string, Emp>();
    filtered.forEach((e) => { if (e.user_id) byUserId.set(e.user_id, e); });
    const has = new Set<string>();
    filtered.forEach((e) => {
      if (!e.manager_id) return;
      if (byId.has(e.manager_id)) has.add(e.manager_id);
      else {
        const mgr = byUserId.get(e.manager_id);
        if (mgr) has.add(mgr.id);
      }
    });
    return Array.from(has);
  }, [filtered]);

  const collapseToDepth = (depth: number) => {
    if (!filtered.length) return;
    const byId = new Map(filtered.map((e) => [e.id, e]));
    const byUserId = new Map<string, Emp>();
    filtered.forEach((e) => { if (e.user_id) byUserId.set(e.user_id, e); });
    const childrenOf = new Map<string | null, string[]>();
    filtered.forEach((e) => {
      let k: string | null = null;
      if (e.manager_id) {
        if (byId.has(e.manager_id)) k = e.manager_id;
        else {
          const mgr = byUserId.get(e.manager_id);
          if (mgr) k = mgr.id;
        }
      }
      const arr = childrenOf.get(k) ?? [];
      arr.push(e.id);
      childrenOf.set(k, arr);
    });
    const next = new Set<string>();
    const walk = (id: string, d: number) => {
      const kids = childrenOf.get(id) ?? [];
      if (d >= depth) {
        if (kids.length) next.add(id);
        return;
      }
      kids.forEach((k) => walk(k, d + 1));
    };
    (childrenOf.get(null) ?? []).forEach((r) => walk(r, 1));
    setCollapsed(next);
  };

  const orphans = useMemo(() => {
    if (!filtered.length) return [];
    const byId = new Map(filtered.map((e) => [e.id, e]));
    const byUserId = new Map<string, Emp>();
    filtered.forEach((e) => { if (e.user_id) byUserId.set(e.user_id, e); });
    const resolved = (m: string | null): string | null => {
      if (!m) return null;
      if (byId.has(m)) return m;
      const v = byUserId.get(m);
      return v ? v.id : null;
    };
    const hasReports = new Set<string>();
    filtered.forEach((e) => {
      const r = resolved(e.manager_id);
      if (r) hasReports.add(r);
    });
    return filtered.filter((e) => !resolved(e.manager_id) && !hasReports.has(e.id));
  }, [filtered]);

  // Center the tree once the container has a size
  useEffect(() => {
    if (containerRef.current) {
      const { width } = containerRef.current.getBoundingClientRect();
      setTranslate({ x: width / 2, y: 100 });
    }
  }, [tree.length]);

  const rootLabel = deptFilter !== "all" ? deptFilter : (orgName ?? "Organization");

  const rootData: Node = tree.length === 1
    ? tree[0]
    : {
        name: rootLabel,
        attributes: { title: `${filtered.length} ${filtered.length === 1 ? "person" : "people"}` },
        children: tree,
        __emp: { id: "root", first_name: "", last_name: "", job_title: null, department: null, status: "active", manager_id: null, user_id: null, photo_path: null },
      };

  async function downloadPng() {
    if (!containerRef.current) return;
    try {
      const dataUrl = await toPng(containerRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `org-chart-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  }

  const renderNode = ({ nodeDatum }: { nodeDatum: Node }) => {
    const e = nodeDatum.__emp;
    if (e.id === "root") {
      const sub = nodeDatum.attributes?.title ?? "";
      return (
        <g>
          <foreignObject x={-140} y={10} width={280} height={64}>
            <div
              style={{
                boxSizing: "border-box",
                width: 280,
                padding: "10px 16px",
                borderRadius: 999,
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
                boxShadow: "0 8px 24px -10px hsl(var(--primary) / 0.45)",
                textAlign: "center",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {nodeDatum.name}
              </div>
              {sub && (
                <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{sub}</div>
              )}
            </div>
          </foreignObject>
        </g>
      );
    }
    const color = deptColor(e.department);
    const soft = deptColorSoft(e.department);
    const url = e.photo_path ? photoMap?.get(e.photo_path) : "";
    const matched = nodeDatum.__match;
    const hasReports = (nodeDatum.children && nodeDatum.children.length > 0) || (nodeDatum.__hiddenCount ?? 0) > 0;
    const isCollapsed = (nodeDatum.__hiddenCount ?? 0) > 0;
    const isVacancy = e.status === "vacant";
    if (isVacancy) {
      return (
        <g>
          <foreignObject x={-140} y={4} width={280} height={120}>
            <div
              onClick={() => navigate({ to: "/jobs" })}
              style={{
                boxSizing: "border-box", width: 280, paddingLeft: 36, position: "relative",
                fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <div
                style={{
                  borderRadius: 999,
                  background: "hsl(var(--background))",
                  border: `2px dashed ${color}`,
                  overflow: "hidden",
                }}
              >
                <div style={{
                  background: soft, color, padding: "8px 14px 8px 56px",
                  fontSize: 13, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase",
                }}>
                  Vacant
                </div>
                <div style={{ padding: "8px 14px 10px 56px", minHeight: 42 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "hsl(var(--foreground))" }}>
                    {e.job_title || "Open position"}
                  </div>
                  {e.department && (
                    <div style={{
                      marginTop: 4, display: "inline-block", fontSize: 10,
                      padding: "1px 8px", borderRadius: 999, background: soft, color, fontWeight: 600,
                    }}>
                      {e.department}
                    </div>
                  )}
                </div>
              </div>
              <div style={{
                position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                width: 64, height: 64, borderRadius: "50%",
                background: "hsl(var(--background))",
                border: `2px dashed ${color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color, fontSize: 22, fontWeight: 700,
                boxShadow: `0 0 0 3px hsl(var(--background))`,
              }}>
                +
              </div>
            </div>
          </foreignObject>
        </g>
      );
    }
    return (
      <g>
        <foreignObject x={-140} y={4} width={280} height={120}>
          <div
            onClick={() => navigate({ to: "/employees/$id", params: { id: e.id } })}
            style={{
              boxSizing: "border-box",
              width: 280,
              position: "relative",
              paddingLeft: 36,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {/* Pill body, split into a dark name header and a light title body */}
            <div
              style={{
                borderRadius: 999,
                background: "hsl(var(--card))",
                border: `1px solid ${matched ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                boxShadow: matched
                  ? "0 10px 28px -12px hsl(var(--primary) / 0.45)"
                  : "0 6px 18px -10px rgba(0,0,0,0.22)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  background: color,
                  color: "white",
                  padding: "8px 14px 8px 56px",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: 0.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {e.first_name} {e.last_name}
              </div>
              <div style={{ padding: "8px 14px 10px 56px", minHeight: 42 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "hsl(var(--muted-foreground))",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {e.job_title || "—"}
                </div>
                {e.department && (
                  <div
                    style={{
                      marginTop: 4,
                      display: "inline-block",
                      fontSize: 10,
                      padding: "1px 8px",
                      borderRadius: 999,
                      background: soft,
                      color,
                      fontWeight: 600,
                    }}
                  >
                    {e.department}
                  </div>
                )}
              </div>
            </div>
            {/* Overlapping avatar on the left */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                width: 64,
                height: 64,
                borderRadius: "50%",
                overflow: "hidden",
                background: soft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color,
                fontSize: 18,
                fontWeight: 700,
                boxShadow: `0 0 0 3px hsl(var(--background)), 0 0 0 5px ${color}, 0 4px 10px rgba(0,0,0,0.18)`,
              }}
            >
              {url ? (
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                initials(e)
              )}
            </div>
            {hasReports && (
              <button
                onClick={(ev) => { ev.stopPropagation(); toggleCollapsed(e.id); }}
                title={isCollapsed ? `Expand ${nodeDatum.__hiddenCount} reports` : "Collapse reports"}
                style={{
                  position: "absolute", top: 6, right: 8, zIndex: 2,
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: isCollapsed ? color : "hsl(var(--muted))",
                  color: isCollapsed ? "white" : "hsl(var(--foreground))",
                  border: "none", borderRadius: 999, padding: "2px 8px",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                }}
              >
                {isCollapsed ? `+${nodeDatum.__hiddenCount}` : ""}
                {isCollapsed
                  ? <ChevronRight size={12} />
                  : <ChevronDown size={12} />}
              </button>
            )}
          </div>
        </foreignObject>
      </g>
    );
  };

  return (
    <AppShell title="Org Chart">
      <Card className="p-4 mb-4 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-xs">Search</Label>
            <Input placeholder="Name, title, department…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Department</Label>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
            <Label htmlFor="inactive" className="text-sm">Include inactive</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="vacancies" checked={showVacancies} onCheckedChange={setShowVacancies} />
            <Label htmlFor="vacancies" className="text-sm">Show vacancies</Label>
          </div>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={() => setCollapsed(new Set())}>Expand all</Button>
            <Button size="sm" variant="outline" onClick={() => setCollapsed(new Set(managerIds))}>Collapse all</Button>
            <Select onValueChange={(v) => collapseToDepth(parseInt(v, 10))}>
              <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Depth…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Depth 1</SelectItem>
                <SelectItem value="2">Depth 2</SelectItem>
                <SelectItem value="3">Depth 3</SelectItem>
                <SelectItem value="99">Depth all</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}>−</Button>
            <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>+</Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
            <Button size="sm" onClick={downloadPng}><Download className="h-4 w-4 mr-1" /> PNG</Button>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {departments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3 pb-2 border-b print:hidden">
            {departments.map((d) => (
              <button
                key={d}
                onClick={() => setDeptFilter(deptFilter === d ? "all" : d)}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border hover:bg-muted transition-colors"
                style={{
                  borderColor: deptFilter === d ? deptColor(d) : "hsl(var(--border))",
                  background: deptFilter === d ? deptColorSoft(d) : "transparent",
                  color: deptFilter === d ? deptColor(d) : "hsl(var(--foreground))",
                  fontWeight: deptFilter === d ? 600 : 500,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: deptColor(d) }} />
                {d}
              </button>
            ))}
          </div>
        )}
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "70vh",
            background:
              "radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground) / 0.15) 1px, transparent 0) 0 0 / 22px 22px, hsl(var(--background))",
          }}
        >
          {isLoading ? (
            <div className="p-6 text-muted-foreground">Loading…</div>
          ) : tree.length === 0 ? (
            <div className="p-6 text-muted-foreground">No employees match the current filters.</div>
          ) : (
            <Tree
              data={rootData as unknown as never}
              orientation="vertical"
              translate={translate}
              zoom={zoom}
              collapsible
              renderCustomNodeElement={renderNode as unknown as never}
              separation={{ siblings: 1.3, nonSiblings: 1.6 }}
              nodeSize={{ x: 300, y: 220 }}
              pathFunc="step"
              pathClassFunc={() => "org-chart-link"}
              zoomable
            />
          )}
        </div>
      </Card>

      {orphans.length > 0 && (
        <Card className="p-4 mt-4 print:hidden">
          <h2 className="font-medium mb-2">Unassigned ({orphans.length})</h2>
          <p className="text-sm text-muted-foreground mb-3">Active employees with no manager and no direct reports.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {orphans.map((e) => (
              <button
                key={e.id}
                onClick={() => navigate({ to: "/employees/$id", params: { id: e.id } })}
                className="flex items-center gap-3 p-2 rounded border hover:bg-muted text-left"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                  style={{ background: deptColor(e.department) }}
                >
                  {e.photo_path && photoMap?.get(e.photo_path) ? (
                    <img src={photoMap.get(e.photo_path)!} alt="" className="w-full h-full object-cover rounded-full" />
                  ) : initials(e) || <UserIcon className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{e.first_name} {e.last_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{e.job_title || "—"} · {e.department || "—"}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
    </AppShell>
  );
}