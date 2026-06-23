import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Users, HardHat, Shield, Clock, FileBadge, HeartHandshake, Landmark, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import markAsset from "@/assets/kyberna-mark.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Noöpolis — Onboarding for Every Municipal Worker" },
      { name: "description", content: "From sworn officers to seasonal park crews, Noöpolis gives every municipal hire the right pre-boarding, forms, training, and provisioning — on day zero." },
      { property: "og:title", content: "Noöpolis — Onboarding for Every Municipal Worker" },
      { property: "og:description", content: "Worker-type templates, mobile field flows, compliance built in." },
    ],
  }),
  component: Index,
});

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
          <Link to="/" className="flex items-center gap-2.5" aria-label="Noöpolis home">
            <img src={markAsset.url} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
            <span className="font-serif text-xl tracking-tight">Noöpolis</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
            <Link to="/auth"><Button>Get started</Button></Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <span className="inline-block text-xs uppercase tracking-widest text-accent-foreground bg-accent px-3 py-1 rounded-full">For municipalities of 500 – 5,000 staff</span>
          <h1 className="mt-6 font-serif text-5xl md:text-6xl tracking-tight leading-[1.05]">
            Onboarding for every kind of <span className="text-primary">municipal worker.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            One platform for office, field, public safety, temporary, contractor, volunteer, and elected staff — with the forms, training, equipment, and provisioning each role actually needs.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth"><Button size="lg">Start a pre-boarding <ArrowRight className="h-4 w-4 ml-2" /></Button></Link>
            <Link to="/auth"><Button size="lg" variant="outline">HR admin sign in</Button></Link>
          </div>
        </div>
      </section>

      <section className="bg-secondary/40 border-y">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl tracking-tight">Built around worker types — not one-size-fits-all</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">Every role gets a tailored playbook. No more sending field crews through desk-worker checklists.</p>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workerTypes.map((w) => (
              <div key={w.name} className="bg-card border rounded-lg p-5">
                <w.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-medium">{w.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            ["Compliance built in", "I-9 + E-Verify, W-4, ADA, FLSA, FMLA, OSHA, CJIS — modeled as first-class objects."],
            ["Mobile-first field flows", "PWA with offline forms for the crews who don't sit at a desk."],
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
      </section>

      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-muted-foreground flex flex-wrap justify-between items-center gap-4">
          <p>© {new Date().getFullYear()} Noöpolis. Built for public service.</p>
          <div className="flex items-center gap-4">
            <a href="/api/public/docs/user-guide" className="hover:text-foreground transition-colors">User Guide</a>
            <a href="/api/public/docs/self-hosting" className="hover:text-foreground transition-colors">Self-Hosting Guide</a>
            <Link to="/auth" className="hover:text-foreground transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
