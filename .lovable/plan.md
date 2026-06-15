## Kyberna P10–P18: Complete the Onboarding Suite

Build out the remaining nine phases on top of the existing foundation (auth, roles, worker types, templates, tasks, forms, documents, provisioning, preboarding portal).

---

### P10 — Notifications & Reminders
- Tables: `notifications` (user_id, type, title, body, link, read_at), `notification_preferences` (per-channel toggles).
- In-app notification bell in app shell with unread badge, dropdown list, mark-read.
- Server fn `enqueue_notification` used by task assignment, due-date reminders, approvals.
- pg_cron daily job → public API route that scans overdue `task_instances` and inserts reminders.
- Email scaffolding wired through Lovable Emails (verify domain status first; ask user if needed).

### P11 — Reporting & Compliance Dashboard
- Route `/reports` (admin/HR only).
- KPI cards: time-to-productivity, open onboardings, overdue tasks, I-9 compliance %, doc completion %.
- Charts (recharts): onboardings by week, avg completion days by worker type, task bottlenecks.
- CSV export server fn for each report.
- Audit log table `audit_events` (actor, action, entity, entity_id, diff jsonb) + viewer page with filters.

### P12 — Equipment & PPE
- Tables: `equipment_catalog` (sku, name, category, sizes jsonb, cost_center), `ppe_sizing` (employee_id, shirt, pants, boot, glove), `equipment_issuance` (employee_id, item_id, issued_at, returned_at, condition, cost).
- Routes: `/equipment` catalog admin, `/equipment/issuance` kanban (Requested → Picked → Issued → Returned).
- Auto-create issuance rows from template tasks tagged `equipment`.

### P13 — Training & Certifications
- Tables: `courses` (name, provider, duration, required_for_worker_types[]), `certifications` (name, issuer, validity_months, compliance_framework), `employee_training` (employee_id, course_id, status, completed_at, score), `employee_certifications` (employee_id, cert_id, issued_at, expires_at, doc_id).
- Route `/training`: catalog, assignments, expiry tracker with color-coded urgency.
- pg_cron weekly: notifications for certs expiring in 30/60/90 days.
- Compliance filter: OSHA, CJIS, HIPAA, IRS 1075.

### P14 — Background Checks & Screening
- Table: `screenings` (employee_id, type [background/fingerprint/drug/MVR/credit], vendor, status, scheduled_at, completed_at, result, doc_id, notes).
- Route `/screenings`: queue view, schedule modal, status updates, document attachment.
- Manual status workflow (no vendor integration — placeholder fields for vendor API later).
- Hooks into onboarding instances: blocking task type `screening`.

### P15 — Benefits Hand-off
- Table: `benefits_handoffs` (employee_id, carrier, plan_type, enrollment_window_start/end, status, external_ref, notes).
- Route `/benefits`: list per employee, mark eligibility, generate hand-off packet (PDF stub with employee + dependents data from a new `dependents` table).
- Webhook endpoint `/api/public/benefits-callback` for carrier confirmations (signed).

### P16 — Policy Acknowledgments
- Tables: `policies` (title, version, body_md, effective_date, requires_reack_months), `policy_acknowledgments` (policy_id, employee_id, version, acknowledged_at, signature_id, ip).
- Route `/policies` admin: CRUD + publish new version triggers re-ack campaign.
- Employee view: list of pending policies with scroll-to-bottom + signature capture (reuse `signatures` table).
- Campaign job: pg_cron monthly checks `requires_reack_months` and enqueues tasks + notifications.

### P17 — Offboarding & Rehire
- Reuse template engine with new `template_type = 'offboarding'`.
- Route `/offboarding`: list of separations, exit checklist, equipment-return integration with P12, access-revocation tasks integration with provisioning.
- Final pay, COBRA notice, exit interview form (reuse form engine).
- Rehire flow: mark employee `rehire_eligible`, one-click clone of original onboarding instance with skip-completed-tasks option.

### P18 — Admin Settings
- Route `/settings`:
  - Org profile (name, EIN, addresses, logo upload).
  - Branding (primary color, accent — write to CSS vars).
  - Retention policies (per-document-category retention years).
  - Notification defaults.
  - SSO config placeholder (SAML metadata URL field — UI only).
- Admin-only via `has_role`.

---

### Cross-cutting work
- Update app shell nav with new sections grouped: People · Workflow · Compliance · Admin.
- Add `has_role` checks via `_authenticated` layout + per-route guards using a `useHasRole` hook.
- All new tables: RLS scoped to org/role, GRANT to authenticated + service_role, updated_at triggers.
- Seed minimal demo data via migration for catalog/policies/courses.

### Technical notes
- ~12 new tables, 1 storage bucket reuse (`onboarding-documents`) + new bucket `policy-documents`.
- ~15 new routes under `_authenticated/`.
- 2 pg_cron jobs (overdue reminders, cert/policy expiry).
- 1 public API route (benefits callback, signature-verified).
- No new external integrations — all vendor fields are manual/placeholder for future connectors.

### Scope explicitly NOT in this plan
- Drag-and-drop visual workflow builder (P10 of original blueprint) — defer.
- Mobile PWA with offline sync — defer.
- Real SCIM/payroll/LMS/badge connectors — fields only, integration later.
- AWS landing zone + IaC — stays on Lovable Cloud.

Estimated migration count: ~9 (one per phase touching DB).
