/** Best-effort Google Calendar event creation via the standard connector gateway. */
export async function tryCreateCalendarEvent(params: {
  summary: string;
  startISO: string;
  durationMinutes: number;
  location?: string;
  attendeeEmails?: string[];
}): Promise<string | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const calKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!lovableKey || !calKey) return null;
  const start = new Date(params.startISO);
  const end = new Date(start.getTime() + params.durationMinutes * 60_000);
  const body = {
    summary: params.summary,
    location: params.location ?? undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: (params.attendeeEmails ?? []).map((email) => ({ email })),
  };
  try {
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
    const res = await fetch(`https://connector-gateway.lovable.dev/google_calendar/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": calKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json = await res.json() as { id?: string };
    return json.id ?? null;
  } catch {
    return null;
  }
}