## Current State vs Full Municipal HRIS

The app already covers a lot of ground: recruit-to-hire, onboarding, core HR/PAF, comp cycles, timekeeping (including public-safety shifts), performance, training/TCOLE/TMRS, grievances, and offboarding. Based on your priorities (Active Directory, payroll-adjacent workflows, deep public safety), here are the remaining gaps that keep it from being a complete municipal HRIS.

### 1. Active Directory / SSO Lifecycle Integration (Highest Priority)
- **Gap**: No SCIM or Azure AD/Google Workspace sync. When an employee is hired, a city IT admin still manually creates accounts. When someone is terminated, there is no automatic disable/de-provisioning trigger.
- **What to build**: SCIM connector or server-to-server user lifecycle hooks (create on "active", suspend on "offboarded/terminated"), group/OU assignment based on department and worker type, and an audit log of sync events.

### 2. Position & Budget Control (FTE Tracking)
- **Gap**: Positions exist, but there is no concept of a "budgeted FTE" vs "filled FTE" vs "vacancy". Municipal finance departments need to see if a department is over/under budgeted headcount before approving a hire or PAF.
- **What to build**: A `position_budgets` table tied to fiscal years, vacancy tracking that blocks requisitions when a department exceeds budget, and an HR-Finance dashboard showing filled/vacant/overbudget positions by department.

### 3. Payroll Export / Feed Depth (Medium Priority)
- **Gap**: Payroll export profiles and pay calendars exist, but there are no ready-to-export formatted files for common municipal payroll systems (e.g., Munis, Tyler, SAP). Timekeeping computes OT/comp but does not generate an import-ready file.
- **What to build**: Export format templates (CSV/fixed-width) for major municipal payroll vendors, mapping time entries + leave + comp-time payouts into the exact columns the downstream system expects.

### 4. Public Safety Deep Compliance
- **Gap**: TCOLE tracking and shift patterns exist, but FTO (Field Training Officer) program phase tracking, CJIS audit-ready personnel folders, and shift bidding are missing.
- **What to build**: FTO phase cards with sign-off gates, a CJIS compliance checklist tied to the employee file, and a shift bid portal where officers rank preferences and the system awards based on seniority.

### 5. Collective Bargaining / Union Contract Support
- **Gap**: No CBA (collective bargaining agreement) rules engine. Step progression, longevity pay, and OT rules are often driven by union contracts, not just FLSA.
- **What to build**: A contract rules engine that auto-calculates step increases at anniversary dates, enforces CBA-specific OT multipliers, and stores contract versions with effective dates.

### 6. Workers' Compensation & Safety
- **Gap**: No OSHA incident reporting, workers' comp claim tracking, or safety committee case management.
- **What to build**: Incident intake forms, claim status tracking with carrier integration hooks, and safety committee action items.

### 7. State / Federal Reporting
- **Gap**: No EEO-1, VETS-4212, or Texas-specific workforce reporting modules.
- **What to build**: Report builders that aggregate employee demographics, veterans status, and pay bands into state/federal filing formats.

### 8. Mobile / Kiosk Clock-In
- **Gap**: Timekeeping is web-only. Field crews and officers need geofenced mobile clock-in or a tablet kiosk.
- **What to build**: A lightweight mobile-optimized clock-in page with geolocation tagging and a kiosk mode for shared devices.

### 9. Succession & Workforce Analytics
- **Gap**: No talent pipeline for critical roles (City Manager, Department Heads) or workforce demographics dashboards for city council presentations.
- **What to build**: A 9-box talent grid, readiness ratings for key positions, and executive dashboards.

---

## Proposed Phases

**Phase 1 — Identity & Access**
- SCIM/Azure AD user provisioning hooks
- Position budget / FTE control
- Payroll export format engine

**Phase 2 — Public Safety & Union**
- FTO phases + CJIS folder
- CBA step-progression engine
- Shift bidding (officer preference + seniority award)

**Phase 3 — Compliance & Mobility**
- OSHA / workers' comp module
- EEO-1 / state reporting
- Mobile clock-in + geofencing

Which phase would you like to start with, or is there a specific gap you want to close first?