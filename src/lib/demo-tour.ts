export const DEMO_EMAIL = "demo.purpose@testingaccount.test";

export type TourStop = {
  to: string;
  title: string;
  body: string;
  try?: string;
};

export const TOUR_STOPS: TourStop[] = [
  {
    to: "/dashboard",
    title: "Dashboard",
    body: "Your home base — KPIs, recent activity, and pending approvals.",
    try: "Scan the cards to see live counts from seeded demo data.",
  },
  {
    to: "/employees",
    title: "Employees",
    body: "Directory of all employees with org, status, and supervisor chain.",
    try: "Open any employee to see their full record, leave, and assignments.",
  },
  {
    to: "/hire-requests",
    title: "Hire Requests",
    body: "Requisition lifecycle: draft → approval → posted.",
    try: "Open the 'Use template' wizard to spin up a Library Aide req in seconds.",
  },
  {
    to: "/approvals",
    title: "Approvals Inbox",
    body: "Every PAF, hire request, and offer that needs your sign-off.",
    try: "The seeded PAF is waiting — approve, return, or comment.",
  },
  {
    to: "/paf",
    title: "Personnel Action Forms",
    body: "Promotions, transfers, separations — fully routed with audit trail.",
    try: "Click 'New PAF' to walk an action through the chain.",
  },
  {
    to: "/jobs",
    title: "Recruiting — Postings",
    body: "Public + internal job postings backed by approved requisitions.",
    try: "Open a posting and use the public 'Apply' link to test the candidate flow.",
  },
  {
    to: "/screenings",
    title: "AI Applicant Screening",
    body: "Human-in-the-loop screening: AI drafts a fit score, recruiters Accept / Edit / Dismiss.",
    try: "Select multiple applicants and run a bulk screening pass.",
  },
  {
    to: "/offers.index",
    title: "Offers",
    body: "Generated offer letters with signed candidate response tokens.",
    try: "Open a pending offer and preview the candidate-facing page.",
  },
  {
    to: "/preboarding",
    title: "Preboarding & Onboarding",
    body: "Task lists, equipment, and provisioning for new hires.",
  },
  {
    to: "/offboarding",
    title: "Offboarding",
    body: "Separation checklist with role-aware task templates.",
    try: "Start an offboarding from any employee to see the generated tasks.",
  },
  {
    to: "/review-cycles",
    title: "Performance — Review Cycles",
    body: "Configure cycles, participants, and calibration sessions.",
  },
  {
    to: "/one-on-ones",
    title: "1-on-1s",
    body: "Templates and meeting notes for manager/employee conversations.",
    try: "Open a meeting to see the role-aware question set.",
  },
  {
    to: "/goals",
    title: "Goals & OKRs",
    body: "Employee + team goals tied back to review cycles.",
  },
  {
    to: "/comp-cycles",
    title: "Compensation Cycles",
    body: "Run merit + market adjustment cycles with proposals and FLSA checks.",
  },
  {
    to: "/policies",
    title: "Policies & Acknowledgements",
    body: "Policy library and acknowledgement campaigns.",
  },
  {
    to: "/training",
    title: "Training & Transcripts",
    body: "Course catalog, assignments, and individual transcripts.",
  },
  {
    to: "/compliance/tcole",
    title: "Compliance — TCOLE / TMRS",
    body: "Texas-specific reporting surfaces (TCOLE peace officers, TMRS retirement).",
  },
  {
    to: "/reports",
    title: "Reports & EEO",
    body: "Headcount, turnover, comp-ratio, EEO snapshot.",
  },
  {
    to: "/admin-modules",
    title: "Module Settings",
    body: "Super-admin toggles to turn entire modules on or off per tenant.",
  },
  {
    to: "/admin-demo",
    title: "Demo Admin",
    body: "Provision the demo account and reset its data on demand.",
    try: "You're already signed in as the demo user — click 'Reset now' to revert.",
  },
];