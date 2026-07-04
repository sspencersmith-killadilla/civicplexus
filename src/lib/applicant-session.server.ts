import { useSession } from "@tanstack/react-start/server";

export type ApplicantSessionData = {
  // Identity key for looking up all signups belonging to this applicant.
  // We use the exact last name (lowercased) that matched, plus applicant_email
  // when present, else the specific signup id as a fallback.
  last_name: string;
  email: string | null;
  signup_id: string; // the row that authenticated the session
};

const sessionConfig = {
  password: process.env.APPLICANT_SESSION_SECRET!,
  name: "applicant_session",
  maxAge: 60 * 60 * 24 * 7, // 7 days
  cookie: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: true,
    path: "/",
  },
};

export async function getApplicantSession() {
  return useSession<ApplicantSessionData>(sessionConfig);
}

export async function readApplicantIdentity(): Promise<ApplicantSessionData | null> {
  const s = await getApplicantSession();
  const d = s.data as Partial<ApplicantSessionData>;
  if (!d?.signup_id || !d.last_name) return null;
  return { signup_id: d.signup_id, last_name: d.last_name, email: d.email ?? null };
}