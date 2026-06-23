Plan to fix the bulk AI screening failure:

1. Replace the current `generateObject` call in `src/lib/applicant-ai.functions.ts` with a plain `generateText` call that asks Lovable AI for a compact JSON object.
2. Add a robust JSON extraction helper that handles markdown fences, surrounding prose, and isolates the first valid object before parsing.
3. Add a normalization step before strict validation:
   - coerce `fit_score` to a 0–100 number
   - default missing `strengths` / `gaps` to empty arrays
   - map or fallback invalid `suggested_status` values to `hold`
   - default missing `suggested_rejection_reason` to `null`
   - trim and clamp all strings to the existing database-safe limits
4. Keep the human-in-the-loop workflow unchanged: generated rows still go into `ai_suggestions`, require recruiter accept/edit/dismiss, and audit events are still recorded.
5. Preserve the current bulk UI behavior, but the toast should now show only real residual failures instead of schema-generation failures for every applicant.
6. After implementation, verify the server function no longer depends on constrained structured output and that the route still compiles with existing imports.