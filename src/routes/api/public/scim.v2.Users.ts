import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

function hash(t: string) { return createHash("sha256").update(t).digest("hex"); }

async function authenticate(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("scim_tokens").select("id,provider_id,revoked_at,expires_at").eq("token_hash", hash(m[1])).maybeSingle();
  if (!data || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  await supabaseAdmin.from("scim_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { providerId: data.provider_id, supabaseAdmin };
}

function scimError(status: number, detail: string) {
  return new Response(JSON.stringify({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail, status }), {
    status, headers: { "Content-Type": "application/scim+json" },
  });
}

function toScimUser(link: any, emp: any) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: link.external_id,
    userName: link.external_user_name ?? emp?.work_email ?? emp?.personal_email,
    name: { givenName: emp?.first_name, familyName: emp?.last_name },
    emails: [{ value: emp?.work_email ?? emp?.personal_email, primary: true }],
    active: link.active && emp?.status === "active",
    meta: { resourceType: "User", created: link.created_at, lastModified: link.updated_at },
  };
}

export const Route = createFileRoute("/api/public/scim/v2/Users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await authenticate(request);
        if (!ctx) return scimError(401, "Unauthorized");
        const { data: links } = await ctx.supabaseAdmin.from("identity_links")
          .select("*, employees(id,first_name,last_name,work_email,personal_email,status)")
          .eq("provider_id", ctx.providerId).limit(100);
        const resources = (links ?? []).map((l: any) => toScimUser(l, l.employees));
        return Response.json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
          totalResults: resources.length, Resources: resources, startIndex: 1, itemsPerPage: resources.length,
        });
      },
      POST: async ({ request }) => {
        const ctx = await authenticate(request);
        if (!ctx) return scimError(401, "Unauthorized");
        const body = await request.json().catch(() => null) as any;
        if (!body?.userName) return scimError(400, "userName required");
        const email = body.emails?.[0]?.value ?? body.userName;
        const externalId = body.externalId ?? body.id ?? body.userName;
        const { data: existingEmp } = await ctx.supabaseAdmin.from("employees")
          .select("id").or(`personal_email.eq.${email},work_email.eq.${email}`).maybeSingle();
        let employeeId = existingEmp?.id as string | undefined;
        if (!employeeId) {
          const { data: newEmp, error } = await ctx.supabaseAdmin.from("employees").insert({
            first_name: body.name?.givenName ?? "Unknown",
            last_name: body.name?.familyName ?? "User",
            personal_email: email,
            status: "preboarding",
          } as never).select("id").single();
          if (error) return scimError(500, error.message);
          employeeId = newEmp!.id;
        }
        const { data: link, error: linkErr } = await ctx.supabaseAdmin.from("identity_links").upsert({
          employee_id: employeeId, provider_id: ctx.providerId, external_id: externalId,
          external_user_name: body.userName, external_email: email,
          active: body.active ?? true, last_synced_at: new Date().toISOString(),
          attributes: body,
        } as never, { onConflict: "provider_id,external_id" }).select("*").single();
        if (linkErr) return scimError(500, linkErr.message);
        await ctx.supabaseAdmin.from("provisioning_events").insert({
          employee_id: employeeId, provider_id: ctx.providerId, direction: "inbound",
          action: "create_user", status: "succeeded", payload: body, processed_at: new Date().toISOString(),
        } as never);
        const { data: emp } = await ctx.supabaseAdmin.from("employees").select("id,first_name,last_name,work_email,personal_email,status").eq("id", employeeId).single();
        return new Response(JSON.stringify(toScimUser(link, emp)), { status: 201, headers: { "Content-Type": "application/scim+json" } });
      },
    },
  },
});
