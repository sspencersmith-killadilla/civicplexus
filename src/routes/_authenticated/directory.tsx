import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, User as UserIcon } from "lucide-react";
import { searchEmployeeDirectory } from "@/lib/employee-directory.functions";
import { getEmployeePhotoUrl } from "@/lib/employee-photos.functions";

export const Route = createFileRoute("/_authenticated/directory")({ component: DirectoryPage });

function Avatar({ photoPath, name }: { photoPath: string | null; name: string }) {
  const photoUrlFn = useServerFn(getEmployeePhotoUrl);
  const { data: url } = useQuery({
    queryKey: ["dir-photo", photoPath],
    enabled: !!photoPath,
    queryFn: async () => (await photoUrlFn({ data: { path: photoPath! } })).url,
    staleTime: 5 * 60_000,
  });
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex items-center justify-center border shrink-0">
      {url ? <img src={url} alt={name} className="w-full h-full object-cover" /> :
        initials ? <span className="text-xs font-medium text-muted-foreground">{initials}</span> :
        <UserIcon className="h-5 w-5 text-muted-foreground" />}
    </div>
  );
}

function DirectoryPage() {
  const searchFn = useServerFn(searchEmployeeDirectory);
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState<string>("all");
  const [status, setStatus] = useState<string>("active");

  const { data, isLoading } = useQuery({
    queryKey: ["directory", q, department, status],
    queryFn: () => searchFn({ data: {
      q: q.trim() || undefined,
      department: department === "all" ? undefined : department,
      status: status === "all" ? undefined : status,
      limit: 200,
    } }),
    staleTime: 30_000,
  });

  const employees = data?.employees ?? [];
  const departments = useMemo(() => data?.departments ?? [], [data]);

  return (
    <AppShell title="Employee Directory">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Search by name, title, or department. Click anyone to view their profile.
        </p>

        <Card className="p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_160px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, title, department…"
                className="pl-9"
              />
            </div>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="preboarding">Pre-boarding</SelectItem>
                <SelectItem value="on_leave">On leave</SelectItem>
                <SelectItem value="offboarded">Offboarded</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : employees.length === 0 ? (
          <Card className="p-10 text-center">
            <Users className="h-8 w-8 mx-auto text-muted-foreground" />
            <h3 className="mt-3 font-medium">No matches</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try a different search term or status filter.</p>
          </Card>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">{employees.length} {employees.length === 1 ? "person" : "people"}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {employees.map((e) => (
                <Link
                  key={e.id}
                  to="/employees/$id"
                  params={{ id: e.id }}
                  className="block"
                >
                  <Card className="p-4 hover:bg-muted/40 transition-colors h-full">
                    <div className="flex items-center gap-3">
                      <Avatar photoPath={e.photo_path} name={`${e.first_name} ${e.last_name}`} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{e.first_name} {e.last_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{e.job_title ?? "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">{e.department ?? "—"}</div>
                      </div>
                      {e.status !== "active" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground whitespace-nowrap">{e.status}</span>
                      )}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}