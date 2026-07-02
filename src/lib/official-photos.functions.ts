import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "official-photos";

async function assertCanManageOfficials(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("can_manage_officials", { _user_id: userId });
  if (error) throw error;
  if (!data) throw new Error("Officials manager only");
}

/**
 * Generate an AI portrait for the next official that has no photo, upload it
 * to the official-photos bucket, and persist photo_path + publish_photo=true.
 * All officials in this project are fictitious. Clerk/HR admins only.
 */
export const seedNextOfficialPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        regenerate: z.boolean().optional(),
        after_last_name: z.string().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageOfficials(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pick the next official needing a photo.
    let query = supabaseAdmin
      .from("officials")
      .select("id, first_name, last_name, photo_path")
      .order("last_name");
    if (!data.regenerate) query = query.is("photo_path", null);
    if (data.regenerate && data.after_last_name) {
      query = query.gt("last_name", data.after_last_name);
    }
    const { data: rows, error } = await query.limit(1);
    if (error) throw error;
    const off = rows?.[0] as
      | { id: string; first_name: string; last_name: string; photo_path: string | null }
      | undefined;
    if (!off) return { done: true, remaining: 0, cursor: null as string | null };

    const { count } = await supabaseAdmin
      .from("officials")
      .select("id", { count: "exact", head: true })
      .is("photo_path", null);

    // Look up the official's most recent seat + body for a role-flavored prompt.
    const { data: termRow } = await supabaseAdmin
      .from("official_terms")
      .select(
        "appointment_type, start_date, official_seats!inner(seat_label, is_chair, governing_bodies!inner(name, kind))",
      )
      .eq("official_id", off.id)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const seat = (termRow as any)?.official_seats;
    const body = seat?.governing_bodies;
    const roleLabel: string = body?.name
      ? seat?.is_chair
        ? `Chair of the ${body.name}`
        : `Member of the ${body.name} (${seat?.seat_label ?? "member"})`
      : "municipal official";
    const category: string = body?.kind === "council" || body?.kind === "governing"
      ? "elected city official"
      : "appointed board/commission member";

    // Deterministic variety per-official so re-runs stay stable-ish.
    const seed = (off.id + off.last_name)
      .split("")
      .reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const ages = ["late 30s", "mid 40s", "early 50s", "late 50s", "mid 60s", "early 70s"];
    const attires = [
      "conservative business suit",
      "blazer over collared shirt",
      "professional blouse and jacket",
      "sport coat and open-collar shirt",
      "structured dress with cardigan",
    ];
    const backgrounds = [
      "neutral light grey studio background",
      "soft warm beige studio background",
      "muted blue-grey studio background",
      "cream studio background",
    ];
    const expressions = [
      "warm friendly smile",
      "confident approachable expression",
      "kind natural half-smile",
      "composed pleasant expression",
    ];
    const age = ages[seed % ages.length];
    const attire = attires[(seed >> 3) % attires.length];
    const background = backgrounds[(seed >> 5) % backgrounds.length];
    const expression = expressions[(seed >> 7) % expressions.length];

    const prompt =
      `Professional civic headshot portrait of a fictional ${category}, ${age}, ` +
      `serving as ${roleLabel} for a small Texas city. ` +
      `Wearing ${attire}. ${expression}, shoulders-up composition, looking directly at the camera. ` +
      `${background}, soft even studio lighting, sharp focus, photorealistic. ` +
      `Not a real person — imaginary character. No text, no name tag, no logo, no watermark, no props.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-image-2",
        prompt,
        size: "1024x1024",
        quality: "low",
        n: 1,
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      throw new Error(`Image gen failed (${aiRes.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await aiRes.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const path = `photos/${off.id}/seed-${Date.now()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw upErr;

    const { error: updErr } = await supabaseAdmin
      .from("officials")
      .update({ photo_path: path, publish_photo: true } as never)
      .eq("id", off.id);
    if (updErr) throw updErr;

    const remaining = Math.max(0, (count ?? 1) - 1);
    return {
      done: !data.regenerate && remaining === 0,
      remaining,
      cursor: off.last_name as string | null,
      official: { id: off.id, name: `${off.first_name} ${off.last_name}` },
    };
  });