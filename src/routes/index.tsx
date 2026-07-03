import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Users, HardHat, Shield, Clock, FileBadge, HeartHandshake, Landmark, ArrowRight, Check, Briefcase, UserPlus, FolderKanban, Wallet, TrendingUp, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import markAsset from "@/assets/civicplexus-mark.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CivicPlexus — The HRIS Built for Local Government" },
      { name: "description", content: "Hire-to-retire HR, payroll, performance, compensation, and compliance — purpose-built for cities and counties. Replaces NEOGOV, Munis HR, and your performance and comp tools with one system." },
      { property: "og:title", content: "CivicPlexus — The HRIS Built for Local Government" },
      { property: "og:description", content: "One system for recruiting, onboarding, core HR, pay, performance, and public-sector compliance." },
    ],
  }),
  component: Index,
});

const modules = [
  { icon: Briefcase, name: "Recruit & Hire", desc: "Requisitions through signed offer, built around civil-service rules.", features: ["Jobs", "Hire Requests", "Interviews", "Screenings", "Offers"] },
  { icon: UserPlus, name: "Onboard & Provision", desc: "Worker-type playbooks that route forms, equipment, and access on day zero.", features: ["Worker Types", "Pre-boarding", "Equipment", "Provisioning"] },
  { icon: FolderKanban, name: "Core HR & Records", desc: "Employees, positions, and personnel actions with a clean audit trail.", features: ["Employees", "PAF", "Positions", "Org Cascades", "Documents"] },
  { icon: Wallet, name: "Pay & Benefits", desc: "Compensation structure and benefits administration that talks to your payroll system.", features: ["Payroll", "Comp Grades", "Comp Cycles", "Market Data", "Benefits"] },
  { icon: TrendingUp, name: "Perform & Develop", desc: "Reviews, goals, and development tied to grade and step progression.", features: ["Reviews", "Calibration", "Goals", "1:1s", "Training"] },
  { icon: Gavel, name: "Comply & Govern", desc: "Public-sector compliance modeled as first-class objects — not PDFs in a folder.", features: ["Policies", "Policy Campaigns", "FLSA/EEO", "TCOLE", "TMRS", "Grievances", "Offboarding"] },
];

const workerTypes = [
  { icon: Users, name: "Office / Admin", desc: "SSO, email, standard policy" },
  { icon: HardHat, name: "Field Staff", desc: "PW, parks, utilities — mobile-first" },
  { icon: Shield, name: "Public Safety", desc: "CJIS, fingerprint, FTO" },
  { icon: Clock, name: "Temporary / Seasonal", desc: "Abbreviated flow" },
  { icon: FileBadge, name: "Contractor / Vendor", desc: "Scoped credentials, NDA" },
  { icon: HeartHandshake, name: "Volunteer", desc: "Background + waiver" },
  { icon: Landmark, name: "Elected / Appointee", desc: "Ethics, public records" },
];

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" aria-label="CivicPlexus home">
            <img src={markAsset.url} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
            <span className="font-serif text-xl tracking-tight">CivicPlexus</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
            <Link to="/auth"><Button>Get started</Button></Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <span className="inline-block text-xs uppercase tracking-widest text-accent-foreground bg-accent px-3 py-1 rounded-full">FOR MUNICIPALITIES OF 50 – 5,000 STAFF</span>
          <h1 className="mt-6 font-serif text-5xl md:text-6xl tracking-tight leading-[1.05]">
            The HRIS built for <span className="text-primary">city and county government.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Hire-to-retire HR, payroll-adjacent workflows, performance, compensation, and public-sector compliance — in one system that understands sworn officers, field crews, seasonals, contractors, volunteers, and elected officials.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth"><Button size="lg">This is a demo <ArrowRight className="h-4 w-4 ml-2" /></Button></Link>
            <Link to="/auth"><Button size="lg" variant="outline">HR admin sign in</Button></Link>
          </div>
        </div>
      </section>

      <section className="bg-secondary/40 border-y">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl tracking-tight">One platform, the whole employee lifecycle</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">Replace your ATS, HRIS, performance tool, and comp tool with a single system designed for the way local government actually runs.</p>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((m) => (
              <div key={m.name} className="bg-card border rounded-lg p-5">
                <m.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-medium">{m.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.features.map((f) => (
                    <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border">{f}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="font-serif text-3xl tracking-tight">One system, every worker type</h2>
        <p className="mt-3 text-muted-foreground max-w-2xl">Tailored playbooks per role — no more sending field crews through desk-worker checklists.</p>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {workerTypes.map((w) => (
            <div key={w.name} className="border rounded-lg p-4">
              <w.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-2 text-sm font-medium">{w.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-secondary/40 border-y">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              ["One system from req to retire", "Replace 3–4 vendors with a single record of truth."],
              ["Public-sector compliance native", "CJIS, TCOLE, TMRS, FLSA, EEO, and public records modeled as first-class objects."],
              ["Mobile-first for field crews", "PWA with offline forms for the staff who don't sit at a desk."],
              ["Open integration fabric", "Entra/Okta, Workday, Munis, ADP, NEOGOV, badge + GIS — out of the box."],
            ].map(([h, p]) => (
              <div key={h}>
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary" />
                  <h3 className="font-medium">{h}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-10 text-sm">
          <div className="grid gap-8 md:grid-cols-4 mb-8">
            <div>
              <p className="font-semibold text-foreground mb-3">Apply & Hire</p>
              <ul className="space-y-2 text-muted-foreground">
                <li><Link to="/serve/apply" className="hover:text-foreground">Job applications</Link></li>
                <li><Link to="/serve" className="hover:text-foreground">Public portal home</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-3">Volunteer</p>
              <ul className="space-y-2 text-muted-foreground">
                <li><Link to="/serve/volunteer/jobs" className="hover:text-foreground">Open volunteer roles</Link></li>
                <li><Link to="/serve/volunteer" className="hover:text-foreground">Volunteer sign-up</Link></li>
                <li><Link to="/serve/volunteer/clock" className="hover:text-foreground">Volunteer clock in / out</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-3">Vendors & Civic</p>
              <ul className="space-y-2 text-muted-foreground">
                <li><Link to="/serve/vendor" className="hover:text-foreground">Vendor registration</Link></li>
                <li><Link to="/serve/candidate-filing" className="hover:text-foreground">Candidate filing</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-3">Resources</p>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="/api/public/docs/user-guide" className="hover:text-foreground">User Guide</a></li>
                <li><a href="/api/public/docs/self-hosting" className="hover:text-foreground">Self-Hosting Guide</a></li>
                <li><Link to="/auth" className="hover:text-foreground">Sign in</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t pt-6 text-muted-foreground">
            <p>© {new Date().getFullYear()} CivicPlexus. Built for public service.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
