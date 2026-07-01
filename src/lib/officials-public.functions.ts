import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public roster: bodies flagged roster_public, with active-term officials. */
export const listPublicBodies = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("official_bodies")
    .select("id, slug, name, kind, description, meeting_cadence, sort_order")
    .eq("roster_public", true)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
});

/** Public detail for one body incl. active members. */
export const getPublicBody = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ slug: z.string().min(1) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: body, error } = await supabaseAdmin
      .from("official_bodies")
      .select("id, slug, name, kind, description, meeting_cadence")
      .eq("slug", data.slug)
      .eq("roster_public", true)
      .maybeSingle();
    if (error) throw error;
    if (!body) return { body: null, members: [] };

    const { data: terms, error: tErr } = await supabaseAdmin
      .from("official_terms")
      .select("id, start_date, end_date, appointment_type, official_seats!inner(id, seat_label, is_chair, body_id), officials(id, first_name, last_name, preferred_name, bio, photo_path, publish_contact, publish_photo, publish_bio, email, phone)")
      .eq("status", "active")
      .eq("official_seats.body_id", body.id);
    if (tErr) throw tErr;

    const members = await Promise.all((terms ?? []).map(async (t: any) => {
      const o = t.officials;
      const s = t.official_seats;
      let photoUrl: string | null = null;
      if (o?.publish_photo && o?.photo_path) {
        const { data: signed } = await supabaseAdmin.storage
          .from("official-photos")
          .createSignedUrl(o.photo_path, 3600);
        photoUrl = signed?.signedUrl ?? null;
      }
      return {
        term_id: t.id,
        seat_label: s?.seat_label ?? "",
        is_chair: !!s?.is_chair,
        appointment_type: t.appointment_type,
        start_date: t.start_date,
        end_date: t.end_date,
        name: o?.preferred_name || `${o?.first_name ?? ""} ${o?.last_name ?? ""}`.trim(),
        bio: o?.publish_bio ? o?.bio ?? null : null,
        photo_url: photoUrl,
        email: o?.publish_contact ? o?.email ?? null : null,
        phone: o?.publish_contact ? o?.phone ?? null : null,
      };
    }));
    members.sort((a, b) => (Number(b.is_chair) - Number(a.is_chair)) || a.seat_label.localeCompare(b.seat_label));
    return { body, members };
  });