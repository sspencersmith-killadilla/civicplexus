import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { listPublicBodies, getPublicBody } from "@/lib/officials-public.functions";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const q = queryOptions({
  queryKey: ["public-officials-print"],
  queryFn: async () => {
    const bodies = await listPublicBodies();
    const detailed = await Promise.all(
      bodies.map(async (b: any) => {
        const r = await getPublicBody({ data: { slug: b.slug } });
        return { body: r.body ?? b, members: r.members };
      }),
    );
    return detailed;
  },
});

export const Route = createFileRoute("/officials/print")({
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  head: () => ({ meta: [{ title: "Public roster — printable" }] }),
  component: PrintRoster,
});

function PrintRoster() {
  const { data } = useSuspenseQuery(q);
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="max-w-4xl mx-auto p-8 bg-white text-black print:p-0">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <h1 className="text-xl font-semibold">Public roster</h1>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print / Save as PDF</Button>
      </div>
      <h1 className="hidden print:block text-2xl font-serif mb-2">Elected officials & appointed boards</h1>
      <p className="hidden print:block text-xs text-gray-600 mb-6">Generated {new Date().toLocaleDateString()}</p>
      {(data as any[]).map(({ body, members }) => (
        <section key={body.id} className="mb-6 break-inside-avoid">
          <h2 className="text-lg font-semibold border-b pb-1">{body.name} <span className="text-xs uppercase tracking-wider text-gray-500">{body.kind}</span></h2>
          {body.meeting_cadence && <p className="text-xs text-gray-600 mt-1">Meets: {body.meeting_cadence}</p>}
          <table className="w-full text-sm mt-2 border-collapse">
            <thead><tr className="text-left text-xs text-gray-600"><th className="py-1 pr-2">Seat</th><th className="py-1 pr-2">Member</th><th className="py-1 pr-2">Appointment</th><th className="py-1 pr-2">Term</th></tr></thead>
            <tbody>
              {members.length === 0 && <tr><td colSpan={4} className="py-1 text-gray-500 italic">Vacant</td></tr>}
              {members.map((m: any) => (
                <tr key={m.term_id} className="border-t">
                  <td className="py-1 pr-2">{m.seat_label}{m.is_chair ? " · Chair" : ""}</td>
                  <td className="py-1 pr-2">{m.name}</td>
                  <td className="py-1 pr-2">{m.appointment_type}</td>
                  <td className="py-1 pr-2">{m.start_date} – {m.end_date ?? "present"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
