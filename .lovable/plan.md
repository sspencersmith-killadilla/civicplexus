
# Municipal Employee Onboarding Suite — Blueprint + MVP Roadmap

## 1. Vision & Differentiators

Build a single onboarding system that handles every "worker type" a municipality actually has — full-time office, field crews, sworn public safety, seasonal/temporary, contractors, volunteers, elected officials, and board appointees — with a flexible, workflow-driven engine instead of the rigid, HR-only flows that NEOGOV, Workday, and Tyler ship.

Differentiators vs. off-the-shelf:
- **Worker-type templates, not one flow.** Each type has its own checklist, forms, approvers, equipment, training, and access-provisioning rules.
- **Mobile + offline first for field staff.** PWA + native shell; sign forms, capture PPE issuance, complete safety modules from a truck with no signal.
- **Pre-boarding from offer acceptance**, not first-day paperwork. I-9 Section 1 pre-day-one, fingerprint scheduling, uniform sizing, locker assignment.
- **Visual workflow builder** HR can edit without IT (drag-and-drop, conditional branching by department/union/role).
- **Provisioning fabric** that talks to Entra/Okta/AD, payroll (ADP/UKG/Munis), badge systems, GIS, fleet, and LMS — so "hire" produces accounts, badges, payroll record, equipment, and training assignment in one transaction with audit trail.
- **Compliance is a first-class object** (not a PDF in a folder): every artifact is tagged to regulation, expiration, jurisdiction, and bargaining unit.
- **Open API + webhook bus** so the municipality is never trapped.

## 2. Worker Types & Flow Variations

| Type | Key variations |
|---|---|
| Office / admin | SSO, e-sign, benefits enrollment, ergonomic assessment |
| Field (PW, parks, utilities) | Mobile/offline, PPE issuance, CDL & DOT medical, OSHA 10/30, lockout/tagout, equipment checkout |
| Public safety (sworn) | CJIS background, fingerprint/Livescan, psych eval, FTO program, POST/academy tracking, duty-weapon issuance, union local routing |
| Temporary / seasonal | Bulk import, short-cycle, auto-expiring access, simplified I-9, lighter benefits, rehire fast-path |
| Contractor / vendor | COI tracking, NDA, limited-scope access, sponsor approval, badge expiry |
| Volunteer | Waiver, background check tier, hour tracking integration |
| Elected / appointee | Oath of office, Form 700/ethics filings, public records training, term-bound access |

## 3. Functional Modules

1. **Pre-boarding portal** (candidate-facing, branded, ADA WCAG 2.1 AA)
2. **Forms & e-signature engine** (versioned templates, conditional fields, SES-tier signatures + audit trail; can integrate DocuSign/Adobe Sign or use built-in)
3. **I-9 + E-Verify** (Section 1 self-serve, Section 2 remote/in-person, reverification queue)
4. **Document vault** (encrypted, retention policies, legal hold)
5. **Workflow & task engine** (HR, hiring manager, IT, facilities, payroll, safety, union steward tasks; SLAs; escalations)
6. **Provisioning orchestrator** (SCIM out to Entra/Okta/AD, payroll API, badge/PACS, LMS, GIS, fleet)
7. **Equipment & PPE** (catalog, sizing, issuance, return, cost center)
8. **Training & certifications** (LMS-lite or LTI to existing LMS; cert expiry, OSHA/CJIS/HIPAA tracking)
9. **Background, drug, fingerprint scheduling**
10. **Benefits enrollment hand-off** (deep link or embedded carrier flow)
11. **Policy acknowledgment library** with versioning and re-acknowledgment campaigns
12. **Mobile field app** (offline PWA + thin native wrapper for camera/biometrics)
13. **Analytics & compliance dashboard** (time-to-productivity, audit readiness, expiring certs)
14. **Admin: workflow builder, form designer, role/permission matrix, audit log viewer**
15. **Offboarding & rehire** (mirror of onboarding; deprovisioning SLA)

## 4. Compliance & Policy Coverage

Federal: I-9, E-Verify, W-4, ADA, FLSA, FMLA, USERRA, EEO-4, OSHA 1910/1926, HIPAA (if self-insured), IRS Pub 1075 (if tax data touched), CJIS Security Policy v5.9+, NIST 800-53 moderate as control baseline, Section 508/WCAG 2.1 AA.
State/local: state new-hire reporting, state W-4 equivalents, state ethics filings, public records (Sunshine/FOIA), workers' comp, retirement system enrollment (e.g., PERS/SERS).
Labor: CBA-driven probation periods, seniority, dues check-off, Weingarten notices.

## 5. Documents & Policies to Produce

**Governance & program docs**
- Onboarding Program Charter
- Worker-Type Matrix & Flow Catalog
- RACI by module
- Records Retention Schedule (aligned to state schedule)
- Accessibility Conformance Report (VPAT 2.5)
- Data Classification & Handling Standard
- Acceptable Use & BYOD Policy
- Mobile Device & Field App Policy
- Identity & Access Management Policy (joiner/mover/leaver)
- Background Check & Adjudication Policy
- I-9 / E-Verify SOP (incl. remote verification under DHS alternative procedure)
- Drug & Alcohol Policy (incl. DOT for CDL holders)
- PPE Issuance & Return SOP
- CJIS Security Addendum & Personnel Screening SOP
- HIPAA Workforce Training SOP (if applicable)
- Ethics, Gifts, and Form 700 SOP
- Volunteer & Intern Policy
- Elected Official Onboarding SOP

**Security & AWS docs**
- System Security Plan (SSP) — NIST 800-53 moderate
- Data Flow Diagram & Network Architecture Diagram
- Threat Model (STRIDE) & Risk Register
- Incident Response Plan + Runbooks
- Disaster Recovery Plan (RTO/RPO defined per module)
- Business Continuity Plan
- Vendor/Third-Party Risk Assessment template
- Encryption & Key Management Standard (KMS, rotation)
- Logging, Monitoring & Audit Policy
- Vulnerability Management & Patch SOP
- Secure SDLC Policy (SAST/DAST/SCA, code review, IaC scan)
- Change Management Policy
- Penetration Test Plan & ROE

**Legal & HR templates**
- Offer letter (per worker type), conditional-offer letter
- At-will / CBA acknowledgments
- Confidentiality / NDA, IP assignment
- Direct deposit, beneficiary, emergency contact forms
- Policy acknowledgment master list
- Loyalty / oath of office (where required)
- Equipment issuance and return agreement
- Telework / remote work agreement
- Separation checklist & exit interview

**Training content (starter)**
- New employee orientation
- Cybersecurity awareness (annual)
- HIPAA (role-based), CJIS Security Awareness (levels 1–4)
- Workplace harassment / EEO
- OSHA 10 (field), Bloodborne pathogens, Defensive driving
- Public records / open meetings

## 6. AWS Reference Architecture (Customer-Hosted)

Region strategy: single primary commercial region (e.g., us-east-2) with warm DR to a second region. If CJIS or state policy requires, deploy in **AWS GovCloud (US)**; the architecture below ports directly.

**Account structure (AWS Organizations + Control Tower)**
- `org-root`, `log-archive`, `audit`, `shared-services`, `network`, `prod`, `nonprod`, `sandbox`
- SCPs deny: public S3, IAM user creation, regions outside approved list, root key usage
- Control Tower guardrails + AWS Config conformance pack (NIST 800-53 / CJIS)

**Network**
- Multi-AZ VPC per env, no public subnets for app/data tiers
- AWS WAF + Shield Standard in front of CloudFront → ALB
- VPC endpoints (S3, KMS, Secrets Manager, Logs, STS, ECR) — keep traffic off the internet
- Site-to-site VPN or Direct Connect to city data center for AD/HRIS connectors
- Network Firewall + GuardDuty + Security Hub + Macie + Detective

**Compute & app tier**
- Containerized services on **ECS Fargate** (or EKS if team prefers), private subnets only
- API: Node/TypeScript or .NET behind internal ALB; public edge via CloudFront + WAF → public ALB → Fargate
- Background workers: Fargate + SQS; scheduled jobs via EventBridge
- Workflow engine: AWS Step Functions for long-running onboarding orchestration
- Event bus: EventBridge (domain events: `HireCreated`, `I9SectionACompleted`, `BackgroundCleared`, `AccessProvisioned`)
- File processing (uploads, OCR, virus scan): S3 → Lambda → ClamAV (or Trend Micro) → Textract (for ID docs)

**Identity**
- **Cognito** user pool federated to city's Entra ID / Okta (SAML/OIDC) for employees and HR admins
- Separate Cognito pool (or same with groups) for candidates pre-hire
- MFA required for admins (WebAuthn preferred); step-up auth for sensitive actions
- IAM Identity Center (SSO) for AWS console access; no IAM users

**Data**
- **Aurora PostgreSQL Serverless v2**, Multi-AZ, encrypted with customer-managed KMS key, IAM auth, automated backups + PITR, snapshots replicated to DR region
- **S3** for documents/forms/signed PDFs: SSE-KMS, Object Lock (governance) for I-9 and records-retention buckets, versioning on, lifecycle to Glacier after retention threshold
- **DynamoDB** for session, idempotency keys, workflow state cache
- **OpenSearch Serverless** for document and audit search
- **Secrets Manager** for connector credentials, with rotation
- **KMS**: per-data-domain CMKs (HR, security, audit), key policies enforce least privilege

**Observability & audit**
- CloudWatch Logs (app + ALB + VPC flow) → centralized in `log-archive` account, immutable (S3 Object Lock + cross-account)
- CloudTrail org-wide, data events on sensitive S3 buckets
- AWS Config + Security Hub + GuardDuty findings aggregated in `audit` account
- Application audit log: append-only Postgres table + mirrored to S3 Object Lock for legal admissibility

**Email, comms, scheduling**
- SES (TLS, DKIM/DMARC) for transactional mail
- Pinpoint or SNS for SMS reminders (field staff)
- EventBridge Scheduler for reminders/escalations

**DevOps & IaC**
- All infra in **Terraform** (or AWS CDK), stored in CodeCommit/GitHub with required reviews
- CI/CD: CodePipeline + CodeBuild (or GitHub Actions with OIDC to AWS, no long-lived keys)
- SAST (CodeQL/Semgrep), SCA (Dependabot/Snyk), IaC scan (tfsec/Checkov), container scan (ECR + Inspector), DAST (OWASP ZAP) in pipeline
- Blue/green deploys via CodeDeploy

**Backup & DR**
- AWS Backup with cross-region copy; quarterly restore drills
- RPO 15 min / RTO 4 hr for core; RPO 1 hr / RTO 24 hr for analytics

**Estimated steady-state AWS cost** (mid-size, not GovCloud): ~$3.5K–6K/mo. GovCloud premium ~1.5–2x.

```text
                Internet
                   │
            CloudFront + WAF
                   │
              Public ALB (HTTPS)
                   │
        ┌──────────┼──────────┐
        │          │          │
     Web App    Public API  Candidate
     (Fargate)  (Fargate)   Portal
        └──────────┼──────────┘
                   │
        EventBridge  ◄──► Step Functions (onboarding orchestrations)
                   │
        ┌──────────┼───────────┬─────────────┐
     Aurora PG   S3 (KMS,    OpenSearch   SQS + Lambda
     (Multi-AZ)  Obj Lock)   (audit/docs) (workers, integrations)
                                                │
                                        VPC endpoints + VPN/DX
                                                │
                                   City AD / Munis / ADP / Okta
```

## 7. Tech Stack (recommended)

- Frontend web + admin: React + TypeScript, TanStack Router/Query, Tailwind
- Mobile field: PWA (offline via IndexedDB + Background Sync) wrapped with Capacitor for camera/biometrics; one codebase
- Backend: NestJS (TypeScript) or .NET 8 — both well-supported on Fargate
- Workflow: Step Functions for orchestration + custom rules engine for visual builder (JSON DSL persisted in Postgres)
- E-sign: built-in SES-tier with optional DocuSign/Adobe Sign adapter
- Reporting: Metabase or QuickSight on read-replica

## 8. Integration Catalog (Phase-able)

- Identity: Entra ID, Okta, on-prem AD (via SCIM + LDAP connector running in a private subnet)
- HRIS/Payroll: Workday (REST), Tyler Munis (SOAP/SFTP), NEOGOV (REST), ADP (REST), UKG/Kronos (REST + SFTP)
- Background: Accurate, Sterling, Checkr (REST + webhooks)
- E-Verify: USCIS Web Services
- Badging/PACS: Lenel/Genetec/CCURE (REST or SDK on prem agent)
- LMS: Vector Solutions/TargetSolutions, Cornerstone (LTI 1.3)
- Fleet/GIS/ERP equipment: Cityworks, Cartegraph (REST)

## 9. Security Controls Matrix (highlights)

- NIST 800-53 moderate baseline; CJIS overlays for PD/Fire modules
- AES-256 at rest (KMS, customer-managed), TLS 1.2+ in transit, mTLS for service-to-service
- Tokenization of SSN/DOB; PII columns encrypted at app layer with envelope encryption
- Role + attribute-based access (RBAC + ABAC by department/union)
- Session timeout, device binding for admins, WebAuthn MFA
- Annual third-party pen test; quarterly internal; continuous bug bounty optional
- SOC 2 Type II readiness even though self-hosted (because the city is the operator)

## 10. 90-Day MVP Roadmap

**MVP scope (deliver a usable v1):**
- Worker types: office + field + temporary (defer sworn PD/Fire and elected to phase 2)
- Pre-boarding portal with task list
- Forms engine + built-in e-signature
- I-9 (Sections 1 & 2) + E-Verify, W-4, direct deposit, emergency contact, policy acknowledgments
- Workflow engine v1 (template-based, JSON; visual builder in phase 2)
- Document vault with retention
- SSO via Entra/Okta; SCIM out to AD
- One payroll connector (the city's actual system)
- Mobile PWA with offline form completion + PPE issuance capture
- Admin: user/role mgmt, audit log viewer, basic reporting
- Full AWS landing zone, IaC, CI/CD, logging, backups

**Sprint plan (2-week sprints, ~3 squads in parallel)**
- S1 (wks 1–2): Landing zone, accounts, network, IaC baseline; product discovery, design system, data model v1
- S2 (3–4): Auth + SSO, candidate portal shell, forms engine core, document vault
- S3 (5–6): I-9 + E-Verify, W-4, e-signature, workflow engine v1, audit log
- S4 (7–8): Mobile PWA offline, PPE module, SCIM/AD provisioning, payroll connector
- S5 (9–10): Admin console, reporting, retention/legal hold, accessibility pass (WCAG)
- S6 (11–12): Pen test, UAT with HR + a field crew + a temp cohort, DR drill, go-live + hypercare

**Team:** 1 PM, 1 designer, 4 full-stack, 1 mobile, 1 DevSecOps, 0.5 security/compliance, 0.5 HR SME, 0.5 union/legal liaison.

**Phase 2 (months 4–9):** visual workflow builder, sworn public-safety module (CJIS + FTO + POST), elected/appointee module, LMS-lite, second payroll/HRIS connectors, advanced analytics, offboarding & rehire, GovCloud port if required.

## 11. Risks & Mitigations

- **Union acceptance** — embed a steward in design; CBA-driven config, not code.
- **CJIS scope creep** — keep sworn module on isolated VPC/account; defer to phase 2 to avoid blocking MVP.
- **Legacy ERP (Munis) integration** — start with nightly SFTP; iterate to API.
- **Change management** — train HR as workflow authors; the visual builder is the long-term moat.
- **Records retention liability** — Object Lock + retention schedule reviewed by city clerk and counsel before go-live.

## 12. Deliverables Checklist (what you walk away with)

- This blueprint, the SSP, DR/IR/BCP plans, data flow + network diagrams, threat model, retention schedule, VPAT, all SOPs and policies listed in §5
- Terraform repo for the full AWS landing zone + app infra
- Application monorepo (web, mobile, API, workers, IaC)
- Connector adapters (SSO, SCIM, payroll, E-Verify)
- Admin and end-user training materials
- Pen test report and remediation log

Ready to move to build mode and start scaffolding the AWS landing zone + app monorepo, or produce any of the §5 documents (SSP, IR plan, I-9 SOP, etc.) as the next concrete artifact.
