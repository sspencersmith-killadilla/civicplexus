# Enable Live Rooms — in-app setup guide

Goal: make it obvious how to turn on live video interview rooms (LiveKit), both to end-users reading docs and to admins inside the app.

## 1. Docs

- **User Guide (`docs/USER_GUIDE.md`)** — add a short "Live interview rooms" subsection under the Interviews module: what live rooms do (panelist multi-party, consent log, optional recording), the "Not configured" state, and a pointer to the Self-Hosting Guide for credential setup.
- **Self-Hosting Guide (`docs/SELF_HOSTING_GUIDE.md`)** — add a "LiveKit (live interview rooms)" section covering:
  1. Create a LiveKit Cloud project (or self-host) → copy the `wss://…` URL, API Key, API Secret.
  2. Save three project secrets: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
  3. Optional egress: configure S3-compatible storage on the LiveKit project to enable recordings (rooms still work without it).
  4. Verification steps + common failures (wrong scheme, region mismatch, expired keys).

## 2. In-app "Not configured" banner

- New server fn `getLiveKitStatus` in `src/lib/interview-livekit.functions.ts` that returns `{ configured: boolean }` (reuses existing `livekitConfigured()`). HR-only.
- On `src/routes/_authenticated/interviews.$id.room.tsx` and the interviews list, when `configured === false` show an `Alert` with:
  - Plain-English explanation that live rooms are off.
  - Numbered setup steps (mirrors the Self-Hosting Guide).
  - "Open setup guide" link to the docs route and a "Copy required secret names" button.
  - For non-HR users: a softer "Live rooms aren't enabled yet — ask your HR admin" message.

## 3. Demo tour + module registry

- Add a tour stop in `src/lib/demo-tour.ts` mentioning live rooms and the setup path.
- In `src/lib/modules.ts`, mark the live-rooms sub-feature description so the module page shows configuration status.

## Technical notes

- No schema changes, no new secrets created automatically — the guide explains how the admin adds them via project Secrets.
- `getLiveKitStatus` uses `requireSupabaseAuth` + `has_role('hr_admin')` check; non-HR callers get `{ configured }` only (no secrets ever leave the server).
- Banner is a presentational component (`src/components/livekit-setup-banner.tsx`) so it can be reused on the interviews list and detail/room routes.
- Docs edits are markdown-only; the existing server-side markdown renderer handles them.
