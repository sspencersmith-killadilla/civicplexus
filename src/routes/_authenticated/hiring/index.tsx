import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Briefcase, Users, Video, FileSignature, UserPlus, ClipboardCheck, MessagesSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hiring/")({ component: HiringHome });

const CARDS = [
  { to: "/jobs", label: "Requisitions", icon: Briefcase, desc: "Draft, publish, and manage open jobs." },
  { to: "/interviews", label: "Interviews", icon: MessagesSquare, desc: "Schedule and score interviews." },
  { to: "/hiring/interview-kits", label: "Interview Kits", icon: Video, desc: "Reusable question sets and rubrics." },
  { to: "/offers", label: "Offers", icon: FileSignature, desc: "Extend offers and track acceptance." },
  { to: "/hire-requests", label: "Hire Requests", icon: UserPlus, desc: "Requests to open a new position." },
  { to: "/screenings", label: "Screenings", icon: ClipboardCheck, desc: "Background checks and pre-hire screens." },
  { to: "/jobs", label: "Applicants", icon: Users, desc: "Open a job to review its applicants." },
];

function HiringHome() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {CARDS.map((c) => {
        const Icon = c.icon;
        return (
          <Link key={c.label} to={c.to}>
            <Card className="p-5 hover:shadow-md transition-shadow">
              <Icon className="h-5 w-5 mb-2 text-primary" />
              <h3 className="font-medium">{c.label}</h3>
              <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}