import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getCareersCustomization = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("org_settings")
    .select("org_name, careers_page_html, careers_page_css, primary_color, accent_color, logo_url")
    .maybeSingle();
  return (data ?? {}) as {
    org_name?: string | null;
    careers_page_html?: string | null;
    careers_page_css?: string | null;
    primary_color?: string | null;
    accent_color?: string | null;
    logo_url?: string | null;
  };
});

export const saveCareersCustomization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      careers_page_html: z.string().max(50000).nullable(),
      careers_page_css: z.string().max(20000).nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("org_settings").select("id").maybeSingle();
    if (!row) throw new Error("Org settings not initialized");
    const { error } = await context.supabase
      .from("org_settings")
      .update({
        careers_page_html: data.careers_page_html,
        careers_page_css: data.careers_page_css,
      } as never)
      .eq("id", (row as { id: string }).id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
