# Kyberna User Guide

Welcome to **Kyberna**, your municipal onboarding suite. This guide walks every role — Admins, HR, Hiring Managers, IT, and Employees — through first-time setup and daily operations. No technical background required.

> Screenshots referenced as `![placeholder]` are intentionally blank. Drop your own PNGs into `docs/img/` before printing or sharing.

---

## 1. Concepts at a glance

| Term | What it means |
| --- | --- |
| **Worker Type** | A category of hire (Office, Field, Public Safety, Volunteer, etc.) that drives which workflow runs. |
| **Template** | A reusable checklist of tasks for a worker type. Templates have versions; publishing a new version rolls it out. |
| **Task Instance** | A single to-do generated for a specific employee from a template task. |
| **Onboarding Instance** | The full checklist running for one employee, created automatically when an employee is added. |
| **Form Definition / Submission** | A fillable form (I-9, W-4, etc.) and the data a person submits. |
| **Signature** | An e-signature captured for a form, document, or policy. |
| **Screening** | Background, fingerprint, drug, MVR, or credit check. |
| **Policy Acknowledgment** | A signed confirmation that an employee has read and accepted a policy version. |
| **Audit Event** | An immutable record of who did what, when. |

---

## 2. First-time setup (Admin — do this once)

### 2.1 Claim the admin role
1. Visit the app, click **Create account**, sign up with your work email.
2. The first signup defaults to the `candidate` role. Promote yourself by asking your installer to run this SQL (or open **Cloud → Database → SQL editor** if you self-host):
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'hr_admin' FROM auth.users WHERE email = 'you@city.gov';
   ```
3. Sign out and back in. You should now see **People**, **Workflow**, **Compliance**, and **Admin** groups in the sidebar.

### 2.2 Configure the organization (Admin → Settings)
- **Org profile**: name, EIN, mailing address, phone.
- **Branding**: primary + accent colors (writes to CSS variables, applies on next reload).
- **Retention policy** (JSON): how long to keep each document kind. Sample:
  ```json
  { "i9": 3, "w4": 4, "policy_ack": 7, "screening": 5, "training_cert": 7 }
  ```
- **SSO metadata URL**: paste your Entra/Okta SAML metadata URL. Apply via support after saving.

### 2.3 Invite your team
Ask each teammate to sign up, then assign their role with:
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'hiring_manager' FROM auth.users WHERE email = 'manager@city.gov';
```
Valid roles: `hr_admin`, `hiring_manager`, `it_admin`, `employee`, `candidate`.

### 2.4 Review seeded worker types and templates
1. **Worker Types** — confirm the list matches what your municipality hires (Office/Admin, Field Staff, Public Safety, Temporary/Seasonal, Contractor/Vendor, Volunteer, Elected/Appointee).
2. **Templates** — every worker type ships with a default "Standard Onboarding" template, fully populated with I-9, W-4, OSHA, fingerprinting, DOT/CDL, equipment, training, and provisioning tasks as relevant.
3. To customize: open a template, **Clone**, edit task list, set `due_offset_days` and assignee role (`employee`, `hr`, `manager`, `it`), then **Publish**.

---

## 3. Building and editing workflows

### 3.1 Templates
- **Add a task**: name, kind (`forms`, `compliance`, `provisioning`, `equipment`, `training`, `screening`, `general`), assignee, due offset (days from start date), optional `form_key` to link a form.
- **Reorder**: drag the handle.
- **Publish**: locks the version. New onboardings use the latest published version automatically.
- **Archive**: hides a template without breaking in-flight onboardings.

### 3.2 Forms
- Build forms in **Forms Library**. Each form has a `key` (used by template tasks), JSON schema, and optional signature requirement.
- Test with **Open as employee** before linking to a template.

### 3.3 Policies
- **Policies** page: create with title, body (Markdown supported), effective date, and re-acknowledgment cadence in months.
- Publishing a new version triggers a re-ack campaign for everyone who previously signed.

---

## 4. Daily HR operations

### 4.1 Add an employee
1. **Employees → New Employee**.
2. Enter name, email, start date, department, worker type.
3. The system creates an **Onboarding Instance** and generates every task. Email the preboarding link.

### 4.2 Preboarding portal (employee view)
The new hire signs in and sees their checklist: forms to fill, documents to upload, policies to sign, training to complete. Progress percentage updates live.

### 4.3 Documents
- Reviewers see uploads in **Documents** with status (Pending, Approved, Rejected) and a preview pane.
- Approve, reject with reason, or request re-upload. All actions write to **Audit Log**.

### 4.4 Provisioning (IT)
- **IT Provisioning** is a kanban: Requested → In Progress → Completed → Rejected.
- Auto-populated from template tasks tagged `provisioning` (email account, badge, laptop, software licenses, system access).

### 4.5 Equipment & PPE
- Maintain the **Equipment Catalog** (SKU, sizes, cost center).
- Capture **PPE sizing** per employee.
- Track **Issuance** with issued/returned dates and condition.

### 4.6 Training & Certifications
- Assign courses, track completion and scores.
- **Expiry tracker** color-codes certs expiring in 30/60/90 days.
- A weekly cron emails responsible parties.

### 4.7 Screenings
- Queue view by status. Schedule with vendor + date, attach result document on completion.
- Tasks of kind `screening` block onboarding completion until cleared.

### 4.8 Benefits hand-off
- Mark eligibility, set enrollment window, attach dependents (DOB, SSN, relationship).
- Generate a hand-off packet for the carrier.

### 4.9 Policy acknowledgments
- Employees see pending policies on their dashboard.
- Scroll-to-bottom is required before the signature pad activates.

---

## 5. Manager view
Managers see only their team. The dashboard shows open onboardings, overdue items, and pending approvals. Approve forms, sign off on equipment receipts, complete exit interviews.

---

## 6. Employee / candidate view
- **My Onboarding**: progress bar, next steps, due dates.
- **Policies**: pending and signed.
- **Documents**: anything you uploaded or that's available to you.
- **Notifications**: in-app bell + email cadence based on your preferences.

---

## 7. Reporting & compliance

### 7.1 Dashboard KPIs
- Time-to-productivity, open onboardings, overdue tasks, I-9 compliance %, document completion %.

### 7.2 Charts
- Onboardings per week, average completion days by worker type, task bottlenecks.

### 7.3 CSV export
Every report has an **Export CSV** button.

### 7.4 Audit log
Filter by actor, entity, date range. Read-only. Retain forever; never delete.

### 7.5 Suggested cadence
| Cadence | Action |
| --- | --- |
| Daily | Check overdue tasks, screening clearances. |
| Weekly | Run open-onboardings report, review cert expirations. |
| Monthly | Audit-log spot check, retention sweep, policy re-ack status. |
| Quarterly | Access review (remove stale `hr_admin`/`it_admin` accounts), backup-restore drill. |

---

## 8. Offboarding & rehire
1. **Offboarding → New Separation**. Pick employee, last day, reason.
2. The system runs the offboarding template: equipment return, access revocation, COBRA notice, final pay, exit interview.
3. Mark `rehire_eligible` true/false.
4. To rehire: open the former record, **Clone Onboarding**, optionally skip completed-once-already tasks.

---

## 9. Notifications
- **In-app bell** shows unread count.
- Email delivery uses your configured SMTP/Resend domain (see Self-Hosting Guide §9).
- Overdue reminders fire daily via `pg_cron`.

---

## 10. Admin housekeeping
- **Add/remove roles** via the `user_roles` table.
- **Rotate API keys** quarterly (see Self-Hosting Guide §12).
- **Verify backups** monthly (restore the latest dump to a scratch project, check row counts).

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| New hire never got the email | Email domain unverified | Re-check DNS records in your email provider |
| "Unauthorized" on a server action | Bearer attacher misconfigured | Verify `src/start.ts` registers `attachSupabaseAuth` |
| Sidebar empty after sign-in | Missing role assignment | Run the `user_roles` INSERT above |
| Policies never appear for employees | Policy not published, or effective date in future | Set `effective_date <= today` and **Publish** |
| Reminders not firing | `pg_cron` job disabled | Re-enable in Cloud → Database → Cron |

### Support escalation template
```
Subject: Kyberna issue — <one-line summary>
Environment: <production / staging>
User affected: <email + role>
What I expected: ...
What happened: ...
Steps to reproduce: 1) ... 2) ...
Audit log timestamp: <UTC>
Screenshot: attached
```

---

## 12. Appendix

### Accessibility
- All interactive elements are keyboard-reachable. `Tab` cycles, `Enter`/`Space` activates.
- Color contrast meets WCAG 2.1 AA.
- Forms support screen readers; labels are always present.

### Mobile
The app is responsive down to 360px. Employees can complete preboarding on a phone.

### Glossary
See §1.
