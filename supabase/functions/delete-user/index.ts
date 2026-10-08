import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response(405, { error: "METHOD_NOT_ALLOWED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(500, { error: "SERVER_CONFIGURATION_ERROR" });
  }
  if (!authHeader) return response(401, { error: "AUTH_REQUIRED" });

  const token = authHeader.replace(/^Bearer\s+/i, "");
  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await caller.auth.getUser(token);
  const actor = userData.user;
  if (userError || !actor) return response(401, { error: "AUTH_REQUIRED" });

  let payload: { user_id?: string };
  try {
    payload = await req.json();
  } catch {
    return response(400, { error: "INVALID_JSON" });
  }
  const targetId = payload.user_id;
  if (!targetId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) {
    return response(400, { error: "INVALID_USER_ID" });
  }
  if (targetId === actor.id) return response(400, { error: "CANNOT_DELETE_SELF" });

  const { data: actorProfile, error: actorProfileError } = await admin
    .from("profiles").select("role").eq("id", actor.id).maybeSingle();
  if (actorProfileError || actorProfile?.role !== "admin") {
    return response(403, { error: "ADMIN_REQUIRED" });
  }

  const { data: targetProfile, error: targetProfileError } = await admin
    .from("profiles").select("id,role").eq("id", targetId).maybeSingle();
  if (targetProfileError) return response(500, { error: "PROFILE_LOOKUP_FAILED" });
  if (!targetProfile) return response(404, { error: "USER_NOT_FOUND" });

  if (targetProfile.role === "admin") {
    const { count, error: countError } = await admin
      .from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if (countError) return response(500, { error: "ADMIN_COUNT_FAILED" });
    if ((count ?? 0) <= 1) return response(409, { error: "CANNOT_DELETE_LAST_ADMIN" });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(targetId);
  if (deleteError) return response(400, { error: deleteError.message });
  const { error: archiveError } = await admin.from("deleted_employees")
    .update({ deleted_by: actor.id }).eq("user_id", targetId);
  if (archiveError) console.error("Deleted employee was archived but actor attribution failed:", archiveError);
  return response(200, { ok: true, deleted_user_id: targetId });
});
