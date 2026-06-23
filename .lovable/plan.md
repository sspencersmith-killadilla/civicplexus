## The mismatch

The homepage pitches CivicPlexus as an **onboarding** product ("Onboarding for every kind of municipal worker," "Start a pre-boarding," three benefit blurbs all about pre-boarding). But the actual app under `_authenticated/` is a full **municipal HRIS + talent suite**: ATS (jobs, offers, interviews, screenings), core HR (employees, PAF, positions, org cascades), payroll, benefits, compensation (grades, market, cycles), performance (reviews, calibration, goals, 1:1s), policies & policy campaigns, leave, grievances, FLSA/EEO audits, TCOLE/TMRS compliance, offboarding, document generation, equipment/provisioning, training transcripts, and reporting. Onboarding is one module of many.

A visitor reading the current homepage would never guess the product replaces NEOGOV + Munis HR + a performance tool + a comp tool.

## What to change

### 1. Hero
- New H1: "The HRIS built for city and county government." (keep worker-type framing as a sub-line, not the whole pitch)
- Subhead names the actual scope: hire-to-retire HR, payroll-adjacent workflows, performance, compensation, and compliance — purpose-built for municipalities.
- Replace "Start a pre-boarding" primary CTA with "Request a demo" / keep "HR admin sign in" secondary. "Start a pre-boarding" is an internal action, not a marketing CTA.
- Eyebrow stays ("For municipalities of 500–5,000 staff").

### 2. Replace the single "worker types" section with a **module grid**
Group the real app surface into ~6 product pillars, each with 2–3 example capabilities pulled from actual routes:

```text
Recruit & Hire      → Jobs, Offers, Interviews, Screenings, Hire Requests
Onboard & Provision → Worker-type templates, Pre-boarding, Equipment, Provisioning
Core HR & Records   → Employees, PAF, Positions, Org Cascades, Documents
Pay & Benefits      → Payroll, Comp Grades, Comp Cycles, Market Data, Benefits
Perform & Develop   → Reviews, Calibration, Goals, 1:1s, Training
Comply & Govern     → Policies, Policy Campaigns, FLSA/EEO Audits, TCOLE, TMRS, Grievances, Offboarding
```

Each pillar gets an icon, title, one-sentence description, and the example feature chips.

### 3. Keep worker-types — but demote it
Move the existing 7-card worker-type grid into a smaller "One system, every worker type" section below the modules. It's a differentiator, not the whole story.

### 4. Rewrite the three-up "why" row
Swap the current three (compliance / mobile / integrations) for four that reflect the breadth:
- "One system from req to retire" (replaces 3 vendors)
- "Public-sector compliance native" (CJIS, TCOLE, TMRS, FLSA, EEO, public records)
- "Mobile-first for field crews"
- "Open integration fabric" (Entra/Okta, Workday, Munis, ADP, NEOGOV, badge, GIS)

### 5. Meta tags
Update `<title>`, description, og:title, og:description to lead with "HRIS for local government" rather than "Onboarding."

## Out of scope
- No changes to authenticated routes, data model, or navigation.
- No new images/illustrations beyond existing lucide icons.
- Footer, header, and auth flow unchanged.

## Files touched
- `src/routes/index.tsx` (the only file)
