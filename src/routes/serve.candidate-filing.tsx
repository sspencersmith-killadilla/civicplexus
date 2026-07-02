import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/serve/candidate-filing")({
  head: () => ({ meta: [{ title: "Candidate filing packet" }] }),
  component: FilingPage,
});

function FilingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link to="/serve" className="text-xs text-muted-foreground hover:text-foreground">← Serve</Link>
          <h1 className="font-serif text-3xl tracking-tight mt-2">Filing to run for elected office</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Candidates for council or mayor must file the required forms with the City Clerk. The
            clerk will confirm receipt and notify you of any deficiencies before the deadline.
          </p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <Card className="p-6">
          <h2 className="font-medium flex items-center gap-2"><FileText className="h-4 w-4" /> Required forms</h2>
          <ul className="text-sm text-muted-foreground mt-3 space-y-2 list-disc pl-5">
            <li>Application for a Place on the Ballot</li>
            <li>Petition in lieu of filing fee (if applicable)</li>
            <li>Statement of Officer / Oath</li>
            <li>Appointment of Campaign Treasurer</li>
            <li>Code of Ethics acknowledgment</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-4">
            Contact the City Clerk's office to obtain the packet, confirm election dates, and schedule your
            filing appointment. Completed forms must be delivered in person or by mail; electronic submission
            is not accepted for elected-office filings.
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="font-medium">Contact the City Clerk</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Please reach out during regular business hours. Filing windows and deadlines are set by
            state election law and the city charter.
          </p>
        </Card>
      </main>
    </div>
  );
}