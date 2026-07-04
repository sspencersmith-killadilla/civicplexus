
## What this adds

When someone signs up for a volunteer shift (anonymous applicant), we email them a one-click verification link. Clicking it marks their email verified. If a matching volunteer account already exists, we auto-link the signup to it. Until an email is verified:
- Coordinators cannot approve the signup.
- The applicant cannot clock in at the kiosk.
- Signed-in volunteers with an unverified email see a "verify your email" wall instead of the portal.

## Prerequisite (blocks everything else)

No email sending domain is set up for this project yet. Nothing can send email until that's done.

<presentation-actions>
<presentation-open-email-setup>Set up email domain</presentation-open-email-setup>
</presentation-actions>

Once the domain is in progress (DNS pending is fine), the rest of the plan runs.

## Database changes

**`volunteer_shift_signups`** — add:
- `email_verified_at` timestamptz (null until verified)
- `email_verification_token_hash` text (SHA-256 of token; raw token only in the email link)
- `email_verification_sent_at` timestamptz
- `email_verification_expires_at` timestamptz (24 h from send)

**`volunteers`** — add:
- `email_verified_at` timestamptz (mirrors verification for account holders)

**RLS/policies**
- Approval policy on `volunteer_shift_signups` updated so `status` can only move from `pending` → `approved` when `email_verified_at IS NOT NULL` (enforced in the coordinator approval RPC + a trigger for defense in depth).
- Clock-in RPC/policy for `volunteer_clock_events` rejects a signup whose `email_verified_at IS NULL`.

**Auto-link on verification** — trigger/RPC: when a signup is verified, if `applicant_email` matches a `volunteers.email` that has a `user_id`, set `signups.volunteer_id` and mark `volunteers.email_verified_at`.

## Server routes / functions

- `POST /api/public/volunteer-signup` (existing) — after insert, generate a 32-byte token, store its SHA-256 hash, enqueue a verification email via Lovable Emails with link `https://<host>/serve/volunteer/verify?token=…`. Response tells the user to check their inbox.
- `GET /api/public/volunteer-verify?token=…` — hash, look up signup, check expiry, set `email_verified_at`, run auto-link RPC, redirect to `/serve/volunteer/verified` (success) or `/serve/volunteer/verify-failed`.
- `POST /api/public/volunteer-verify/resend` — rate-limited (max 1/min per signup), regenerates token + re-sends email.

Coordinator "approve" server fn (`_authenticated`) rejects with a clear "email not verified" error when the flag is missing; the button in the coordinator UI is disabled with a tooltip in that state.

Kiosk clock-in server fn checks the same flag before creating a `volunteer_clock_events` row and returns "Please verify your email first — check your inbox."

## Email template

Scaffold a single transactional template `volunteer-email-verification` (React Email) with brand styling matching the app: subject "Verify your email to volunteer with CivicPlexus", H1, plain-language body, big button → verify URL, plain-text fallback URL, 24 h expiry note, resend link.

## UI changes

- **`/serve/volunteer/jobs/:slug`** success screen — replace "A coordinator will review…" with "Check your email to verify the address you gave us — we can't confirm your shift until you click the link." Include a "Resend verification email" action.
- **`/serve/volunteer/verified`** — public confirmation page: "Email verified. A coordinator will approve your shift and email you a PIN." If auto-linked to an account, adds "Open your volunteer portal" CTA.
- **`/serve/volunteer/verify-failed`** — expired/invalid token; offers resend by email.
- **`/serve/volunteer/clock`** kiosk — if PIN + last name match a signup with unverified email, show "Please verify your email first" instead of clocking in.
- **`/volunteer` portal (authenticated)** — if `volunteers.email_verified_at IS NULL` for the current user, render a verification wall with "Send verification email" button; portal contents hidden until verified. Signup flow at `/auth?volunteer=1` already triggers Supabase email confirmation; on portal first-load we copy that confirmation into `volunteers.email_verified_at` from `auth.users.email_confirmed_at`.
- **Coordinator shift signups list** — new "Email" column shows Verified / Pending badge; Approve button disabled with tooltip when pending; "Resend verification" action available.

## Order of operations

1. User completes email domain setup (dialog above).
2. Migration for the new columns + trigger + updated policies + auto-link RPC.
3. Scaffold Lovable auth email templates (project has none) + transactional email infrastructure.
4. Add the `volunteer-email-verification` template + registry entry.
5. Wire signup route to enqueue verification email; add verify + resend routes.
6. Add verification gates to approval RPC + clock-in RPC + portal loader.
7. UI updates on signup success, coordinator list, kiosk, portal, and the two new public pages.

## Out of scope

- Phone/SMS verification.
- Changing existing account signup flow at `/auth?volunteer=1` beyond mirroring Supabase's `email_confirmed_at` into `volunteers.email_verified_at`.
- Retroactively unverifying existing approved/clocked-in signups (they stay valid).
