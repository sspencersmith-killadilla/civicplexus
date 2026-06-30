
# Video Interview Portal

Two surfaces wired into the existing ATS (`job_applications` → `interviews` → `interview_feedback`):

1. **Async one-way round** — candidate answers 1–2 questions, max 2 takes, second is final.
2. **Live panel round** — multi-interviewer LiveKit room with cloud recording, watermark, captions.

Both share a consent gate, accommodation request flow, retention policy, and audit trail.

## 1. Data model (new migration)

- `interview_kits` — reusable question sets (HR-admin CRUD). Columns: `id`, `name`, `kind` (`one_way`|`live`), `questions jsonb` (array of `{ id, prompt, think_seconds, max_answer_seconds, allow_retake }`), retention/consent defaults.
- `interview_invitations` — one row per candidate invite. `application_id`, `kit_id`, `kind`, `token_hash`, `expires_at`, `status` (`pending`|`in_progress`|`submitted`|`expired`), `consent_at`, `accommodation_request`, `device_check jsonb`, `aivi_disclosure_ack_at`.
- `interview_responses` — per question. `invitation_id`, `question_id`, `take_number` (1|2), `is_final`, `media_object_path`, `duration_seconds`, `transcript`, `captions_vtt_path`, `created_at`. Unique `(invitation_id, question_id, take_number)`. Server enforces: take 2 auto-marks final regardless of preference.
- `interview_rooms` — for live panel. `interview_id` (FK existing `interviews`), `livekit_room_name`, `livekit_sid`, `started_at`, `ended_at`, `egress_id`, `recording_object_path`, `consent_log jsonb` (per participant: name, role, consented_at, ip), `watermark_text`.
- `interview_recording_access` — every view of a recording (HR/panel only). `recording_path`, `viewed_by`, `viewed_at`, `signed_url_expires_at`.
- `interview_retention_jobs` — scheduled purge (default 90 days, configurable per requisition via `job_requisitions.interview_retention_days`).
- `interview_dsr_requests` — GDPR/CCPA delete/export queue.

Storage buckets (private): `interview-media-oneway`, `interview-media-live`. Signed URLs only, max TTL 1 hour, name+timestamp overlay burned in via LiveKit egress for live; for one-way, watermark rendered client-side in the playback component.

All tables: GRANT pattern, RLS scoped to HR admin, recruiter on the requisition, and assigned panelists (via `interviews.interviewer_ids`). Candidate access only via token-scoped public route, no RLS read by `anon`.

## 2. Compliance layer

- **Two-party consent**: blocking modal before any capture starts in both flows. Logs `consent_at`, IP, user agent. Recording cannot begin until acknowledged. Live room: every joiner (panelist or candidate) acknowledges before mic/cam publish; logged in `interview_rooms.consent_log`.
- **Illinois AIVI Act + NYC LL 144**: pre-interview disclosure screen — explains AI use (transcription only by default; bias-audit-ready), names the vendor (OpenAI Whisper or LiveKit Agents STT), asks consent. Org setting `ai_assist_enabled` per requisition; default off. No automated scoring. Bias-audit export endpoint (`/api/public/compliance/ll144-export`, HR-token gated) dumps demographic + decision data.
- **EEOC / ADA accommodations**: invitation page has "Request an accommodation" link → form (extra think time, extended answer length, captions on by default, alternate format). Routes to recruiter inbox; recruiter approves → updates `interview_invitations.accommodation_request`, which the runner honors (server-side timer overrides).
- **GDPR/CCPA DSR**: `/candidate/$token/privacy` page lets candidates request export or deletion; recruiter dashboard `Privacy requests` tab. Deletion drops media from storage + nulls transcripts; export bundles JSON + media signed URLs.
- **Retention**: pg_cron job hits `/api/public/hooks/interview-retention` daily; purges media + transcripts after 90 days, keeps audit row.

## 3. Async one-way runner (`/candidate/$token/interview`)

Token-gated public route (reuses `candidate_tokens` pattern). Flow:

1. Consent + AIVI disclosure + accommodation prompt.
2. Device check (`getUserMedia`, mic level meter, downlink via `navigator.connection`, browser support gate). Recorded to `interview_invitations.device_check`.
3. Per question: show prompt, count down `think_seconds`, then record up to `max_answer_seconds` via `MediaRecorder` (VP9/Opus → webm, fallback H.264). Upload chunked to storage via signed multipart URL.
4. After take 1, candidate sees playback + choice "Use this take" or "Use my one retake". If retake → record take 2; **take 2 is automatically final** (server validation rejects any "use take 1" submission once take 2 exists).
5. Auto-transcribe on submit (server fn calls Lovable AI / Whisper), store VTT for captions.
6. Submission marks invitation `submitted`, fires recruiter notification, links recording to the `interviews` row (new `kind='one_way'`).

Server functions in `src/lib/interview-async.functions.ts`. Public token endpoints in `src/routes/api/public/interview/$token/*` (upload-url, submit-take, finalize).

## 4. Live panel room (`/interviews/$id/room`)

LiveKit Cloud integration. Requires connector secrets `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` (added via `add_secret` flow, not committed).

- `joinLiveInterviewRoom` server fn (requires auth + interviewer-or-candidate membership) mints a LiveKit JWT with room name `iv_<interview_id>`, identity = user id, name overlay metadata, and `canPublish` based on role.
- Candidate joins via public token route `/candidate/$token/live` — mints a guest JWT after consent.
- Room UI built with `@livekit/components-react`: grid view, raise hand, chat, screen share, captions panel (LiveKit transcription agent), structured scorecard side-panel (rubric pulled from kit; saved per panelist to existing `interview_feedback`).
- Recording: LiveKit egress to private bucket with `{interviewerNames} • {timestamp}` watermark. Cannot start until all participants have consented; consent state tracked per identity. If anyone revokes, egress stops.
- After interview: recording auto-attached to `interview_rooms`; `interviews.status = 'completed'`; panelists prompted to submit scorecards.

## 5. HR / recruiter UI

- `/admin-interview-kits` — CRUD for question kits and rubrics.
- `/jobs/$id` → "Interview rounds" tab — assign kits per stage (`one_way` round before `phone`, `live` panel later).
- Applicant pool bulk action "Send one-way interview" — mints invitations, sends email via existing `sendApplicantEmail`.
- `/interviews/$id` — existing route extended: shows recording player (watermarked, no download), captions, consent log, all scorecards, "Request DSR action" button.
- Settings: per-requisition retention override, AI features toggle, default kit.

## 6. Module gating + docs

- Register `interview_portal` module in `src/lib/modules.ts`; wrap routes in `<ModuleGate>` so super admins can disable.
- Update `docs/USER_GUIDE.md` (Interview Portal section with consent, accommodation, retention) and `docs/SELF_HOSTING_GUIDE.md` (LiveKit setup, env vars, retention cron). Add a demo tour stop.

## 7. Testing

- Vitest unit tests for the "take 2 is final" enforcement, consent-required-before-record guard, retention cutoff, and DSR delete cascade.
- Manual matrix: Chrome/Firefox/Safari desktop + iOS Safari + Android Chrome for `MediaRecorder` codecs.

## Open items requiring user input mid-build

- LiveKit credentials (`add_secret` after the user provisions a LiveKit Cloud project).
- Confirm transcription provider: Lovable AI Whisper vs LiveKit Agents STT (default to Lovable AI to avoid extra vendor).

## Technical notes

- Keep all secrets server-side; LiveKit JWTs minted in `createServerFn`, never exposed to candidates without token validation.
- Watermark on live = LiveKit egress layout template (HTML). Watermark on one-way playback = CSS overlay on `<video>` (recording itself is unwatermarked since only HR/panel can ever retrieve it via signed URL + access log).
- All public token routes rate-limited (reuse existing `candidate_tokens` patterns).
- No `dangerouslySetInnerHTML` on candidate-supplied data; transcripts rendered as text.
