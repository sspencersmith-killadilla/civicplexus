/** Best-effort Resend email send. Returns true on success, false on missing key / failure. */
export async function sendApplicantEmail(params: {
  to: string;
  subject: string;
  body: string;        // plain text or HTML
  from?: string;
}): Promise<boolean> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !resendKey) return false;
  const from = params.from ?? process.env.APPLICANT_EMAIL_FROM ?? "Careers <onboarding@resend.dev>";
  try {
    const html = /<[a-z][^>]*>/i.test(params.body) ? params.body : `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(params.body)}</pre>`;
    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({ from, to: [params.to], subject: params.subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]!));
}