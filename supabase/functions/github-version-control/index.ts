import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") || "bdallagaber/Farma";
const GITHUB_BRANCH = Deno.env.get("GITHUB_BRANCH") || "main";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

async function github(path: string, init: RequestInit = {}) {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN غير مضبوط في إعدادات Edge Function.");
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.message || `GitHub API error ${res.status}`;
    throw new Error(message);
  }
  return body;
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("غير مصرح: يلزم تسجيل الدخول.");
  const token = auth.slice(7);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) throw new Error("جلسة الدخول غير صالحة.");
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (profileError || profile?.role !== "admin") throw new Error("غير مصرح: هذه العملية متاحة للمدير فقط.");
  return { user, profile };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { user, profile } = await requireAdmin(req);
    const payload = await req.json().catch(() => ({}));
    const action = payload?.action;

    if (action === "list_versions") {
      const commits = await github(`/repos/${GITHUB_REPO}/commits?sha=${encodeURIComponent(GITHUB_BRANCH)}&per_page=30`);
      return json({
        versions: commits.map((c: any) => ({
          sha: c.sha,
          message: (c.commit?.message || "").split("\n")[0],
          date: c.commit?.author?.date || c.commit?.committer?.date,
          author: c.author?.login || c.commit?.author?.name || "غير معروف",
          url: c.html_url,
        })),
      });
    }

    if (action === "view_version") {
      const sha = String(payload?.sha || "");
      if (!/^[0-9a-f]{7,40}$/i.test(sha)) return json({ error: "Commit SHA غير صالح." }, 400);
      const commit = await github(`/repos/${GITHUB_REPO}/commits/${sha}`);
      return json({
        sha: commit.sha,
        message: commit.commit?.message || "",
        date: commit.commit?.author?.date || commit.commit?.committer?.date,
        author: commit.author?.login || commit.commit?.author?.name || "غير معروف",
        files: (commit.files || []).map((f: any) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          changes: f.changes,
        })),
      });
    }

    if (action === "restore_version") {
      const sha = String(payload?.sha || "");
      if (!/^[0-9a-f]{7,40}$/i.test(sha)) return json({ error: "Commit SHA غير صالح." }, 400);

      const [target, currentRef] = await Promise.all([
        github(`/repos/${GITHUB_REPO}/commits/${sha}`),
        github(`/repos/${GITHUB_REPO}/git/ref/heads/${GITHUB_BRANCH}`),
      ]);

      const currentSha = currentRef?.object?.sha;
      if (!currentSha) throw new Error("تعذر تحديد الإصدار الحالي.");
      if (currentSha === target.sha) return json({ error: "هذا هو الإصدار الحالي بالفعل." }, 400);

      const treeSha = target?.commit?.tree?.sha;
      if (!treeSha) throw new Error("تعذر تحديد ملفات الإصدار المطلوب.");

      const shortSha = target.sha.slice(0, 10);
      const actor = profile?.full_name || user.email || user.id;
      const commit = await github(`/repos/${GITHUB_REPO}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
          message: `Restore Farma to version ${shortSha} by ${actor}`,
          tree: treeSha,
          parents: [currentSha],
        }),
      });

      const updatedRef = await github(`/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });

      return json({
        success: true,
        commit_sha: commit.sha,
        restored_from: target.sha,
        branch: GITHUB_BRANCH,
        ref: updatedRef?.object?.sha,
      });
    }

    return json({ error: "عملية غير معروفة." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." }, 400);
  }
});
