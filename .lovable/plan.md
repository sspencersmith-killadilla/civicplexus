## Goal

Ship a comprehensive, role-aware **End User Guide** covering every module and feature, so Employees, Supervisors, HR Admins, Recruiters, Payroll, and Super Admins each know exactly how to use CivicPlexus.

## Deliverable

A single new doc, `docs/END_USER_GUIDE.md`, rendered inside the app and on the public docs site alongside the existing User Guide and Self-Hosting Guide.

### Structure

1. **How to use this guide** — legend of role badges (👤 Employee, 👥 Supervisor, 🧑‍💼 HR Admin, 🎯 Recruiter, 💵 Payroll, 🛡️ Super Admin), sign-in basics, navigation, sidebar collapse, mobile hamburger, offline PWA.
2. **One chapter per module**, each with:
   - What it is (1–2 sentences)
   - Who can use it (role badges)
   - Where to find it (sidebar path)
   - Step-by-step workflows for each role that touches it
   - Common tasks / tips / gotchas
   - Related modules

### Modules covered (grouped as in the sidebar)

- **Overview**: Dashboard, My HR, Directory, Org Chart, Notifications, Help
- **People**: Employees, Employee Import, Employee Profile, Photos & Badges, ID Badge Templates, Personnel History
- **Time & Leave**: Timekeeping (clock in/out, exempt schedules, comp time), Shift Patterns, Leave Requests & Approvals, Offline PWA use
- **Performance**: Goals, Cascades, 1-on-1s (templates + meetings + transfer on supervisor change), Reviews & Review Cycles, Calibration
- **Compensation**: Comp Grades, Market Ranges, Comp Cycles, HR Finance / Budget & FTE
- **Hiring**: Requisitions (Draft→Approval→Posted wizard), Positions, Hire Requests, Jobs, Applicant Pool + AI Screening (HITL), Interview Kits, Interviews (index, live LiveKit rooms, async two-take), Offers, Careers Page customization + brochures, Internal Careers
- **Onboarding / Offboarding**: Preboarding, New Hire Compliance, Offboarding workflow, Equipment, Provisioning
- **PAF & Approvals**: PAF create/submit/approve, Approval Inbox, Approval chain + audit log
- **Compliance**: OSHA, TCOLE, TMRS, EEO Snapshot, FLSA Audit, Policies & Policy Campaigns, Grievances, CBA, Documents, Doc Templates, Docs Generator, Forms, Training / LMS / Transcripts
- **Payroll**: Payroll Runs, Profiles, Payroll Export
- **Reports**: Reports, Recruiting Reports, Audit Log
- **Admin**: Setup Wizard, Org Settings (roles + AI), Module Toggles, Identity/SCIM, Migration, Demo Sandbox, Email Templates, Retention Settings, Worker Types, Settings

### How it's surfaced

- **In-app**: add a third tab "End User Guide" to `/help` alongside User Guide and Self-Hosting Guide (`src/routes/_authenticated/help.tsx`). Same Markdown renderer, same download button.
- **Public docs site**: register a new slug `end-user-guide` in `src/routes/api/public/docs/$file.ts` so `/api/public/docs/end-user-guide` renders with the existing TOC + mobile-friendly layout and `.md` download works.
- **Demo tour**: add a step pointing new users to Help → End User Guide.

### Out of scope

- No code/behavior changes to the modules themselves.
- No new PDFs (Markdown only; users can print to PDF from browser). If you want branded PDFs later, we can add a follow-up.
- Video walkthroughs.

### Technical notes

- Guide will be a single ~long Markdown file with H2 per module and H3 per role workflow, so the existing TOC generator (H2/H3) produces clean navigation.
- Role badges rendered as inline emoji + bold text (no images), so print and screen-reader friendly.
- Content sourced from the current app's routes, modules registry (`src/lib/modules.ts`), existing `docs/USER_GUIDE.md`, and prior work already shipped (1-on-1, PAF, badges, interviews, PWA, timekeeping, etc.).

Confirm and I'll write it.