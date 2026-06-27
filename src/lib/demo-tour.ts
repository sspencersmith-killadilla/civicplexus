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
    try: "Open any employee to see their full record, photo, and ID badge controls.",
  },
  {
    to: "/org-chart",
    title: "Org Chart",
    body: "Photo-driven hierarchy built from manager relationships, color-coded by department.",
    try: "Search a name, then export the visible chart as a PNG or print it.",
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
    to: "/offers",
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
    to: "/one-on-one-templates",
    title: "1-on-1 Templates (HR Admin)",
    body: "Create, clone, and publish the manager + employee question sets used by every 1:1.",
    try: "Clone a template, edit a prompt, and publish — the next meeting picks it up.",
  },
  {
    to: "/cascades",
    title: "Cascades",
    body: "Org-wide directives that flow from leadership to teams with AI-rollup of responses.",
    try: "Open a cascade to see the Responses panel and the AI rollup card.",
  },
  {
    to: "/goals",
    title: "Goals & OKRs",
    body: "Employee + team goals tied back to review cycles.",
  },
  {
    to: "/timekeeping",
    title: "Timekeeping",
    body: "Clock in/out, weekly totals, overtime and comp-time accruals — works offline.",
    try: "Exempt? Edit your weekly schedule. Non-exempt? Clock in, then approve from the manager view.",
  },
  {
    to: "/shift-patterns",
    title: "Public Safety Shift Patterns",
    body: "Multi-week rotations (24/48, Kelly, Pitman) with FLSA 207(k) overtime thresholds.",
    try: "Assign a Kelly pattern to a firefighter and watch the timesheet honor the 53-hour threshold.",
  },
  {
    to: "/comp-cycles",
    title: "Compensation Cycles",
    body: "Run merit + market adjustment cycles with proposals and FLSA checks.",
  },
  {
    to: "/hr-finance",
    title: "HR + Finance — FTE Budget",
    body: "Department FTE budgets per fiscal year; requisitions check headroom before saving.",
    try: "Edit a department budget, then open a new requisition to see the live headroom check.",
  },
  {
    to: "/payroll/profiles",
    title: "Payroll Export Profiles",
    body: "Vendor templates for Tyler Munis, BS&A, ADP, Paycom — map fields once, export every run.",
  },
  {
    to: "/policies",
    title: "Policies & Acknowledgements",
    body: "Policy library and acknowledgement campaigns.",
  },
  {
    to: "/cba",
    title: "Union Contracts (CBA)",
    body: "Track collective bargaining agreements, terms, and effective dates.",
  },
  {
    to: "/osha",
    title: "OSHA 300 / 300A",
    body: "Log workplace incidents, classify outcomes, and generate the 300A summary.",
  },
  {
    to: "/lms-imports",
    title: "LMS Imports (TCOLE)",
    body: "Ingest external training completions and map to TCOLE continuing-education credits.",
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
    to: "/admin-identity",
    title: "Identity & SSO (SCIM)",
    body: "Wire up Entra/Okta SAML and SCIM provisioning for hands-free account lifecycle.",
  },
  {
    to: "/admin-modules",
    title: "Module Settings",
    body: "Super-admin toggles to turn entire modules on or off per tenant.",
  },
  {
    to: "/offline-shell",
    title: "Offline PWA Shell",
    body: "Installable shell for clock in/out, leave requests, and approvals that keep working offline.",
    try: "Install to home screen, go airplane mode, clock out — it syncs in the background when you reconnect.",
  },
  {
    to: "/id-badge-templates",
    title: "ID Badge Templates",
    body: "Design printable CR80 badges — choose fields, brand colors, and the default template.",
    try: "Toggle a field on the default template, then generate a badge from any employee profile.",
  },
  {
    to: "/admin-demo",
    title: "Demo Admin",
    body: "Provision the demo account and reset its data on demand.",
    try: "You're already signed in as the demo user — click 'Reset now' to revert.",
  },
];