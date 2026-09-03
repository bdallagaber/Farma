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
      "X-GitHub-Api-Version": "2026-03-10",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `GitHub API error ${res.status}`);
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

function decodeBase64(value: string): string {
  return decodeURIComponent(Array.from(atob(value.replace(/\s/g, "")))
    .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
    .join(""));
}

function splitLines(text: string) {
  const hasFinalNewline = text.endsWith("\n");
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (hasFinalNewline) lines.pop();
  return { lines, hasFinalNewline };
}

function joinLines(lines: string[], hasFinalNewline: boolean) {
  return lines.join("\n") + (hasFinalNewline ? "\n" : "");
}

function parseHunks(patch: string) {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const hunks: { newStart: number; oldLines: string[]; newLines: string[] }[] = [];
  let current: { newStart: number; oldLines: string[]; newLines: string[] } | null = null;
  for (const line of lines) {
    const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (match) {
      current = { newStart: Number(match[2]), oldLines: [], newLines: [] };
      hunks.push(current);
      continue;
    }
    if (!current || line === "\\ No newline at end of file") continue;
    if (line.startsWith(" ")) {
      const value = line.slice(1);
      current.oldLines.push(value);
      current.newLines.push(value);
    } else if (line.startsWith("-")) {
      current.oldLines.push(line.slice(1));
    } else if (line.startsWith("+")) {
      current.newLines.push(line.slice(1));
    }
  }
  return hunks;
}

function applyReversePatch(currentText: string, patch: string): string {
  const hunks = parseHunks(patch);
  if (!hunks.length) throw new Error("لا يمكن قراءة التعديل المطلوب لهذا الملف بأمان.");

  const current = splitLines(currentText);
  const lines = current.lines.slice();

  // Apply from bottom to top so line positions from the patch remain meaningful.
  for (let h = hunks.length - 1; h >= 0; h--) {
    const hunk = hunks[h];
    const expected = hunk.newLines;
    const replacement = hunk.oldLines;
    const hint = Math.max(0, hunk.newStart - 1);
    const matches: number[] = [];

    if (expected.length === 0) {
      matches.push(Math.min(hint, lines.length));
    } else {
      for (let i = 0; i <= lines.length - expected.length; i++) {
        let ok = true;
        for (let j = 0; j < expected.length; j++) {
          if (lines[i + j] !== expected[j]) { ok = false; break; }
        }
        if (ok) matches.push(i);
      }
    }

    if (!matches.length) {
      throw new Error("التعديل متعارض مع تغييرات أحدث في نفس الملف.");
    }

    matches.sort((a, b) => Math.abs(a - hint) - Math.abs(b - hint));
    const start = matches[0];
    lines.splice(start, expected.length, ...replacement);
  }

  return joinLines(lines, current.hasFinalNewline);
}

async function getFile(path: string, ref: string) {
  try {
    return await github(`/repos/${GITHUB_REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`);
  } catch (error) {
    if (error instanceof Error && /Not Found/i.test(error.message)) return null;
    throw error;
  }
}

async function getFileText(path: string, ref: string) {
  const file = await getFile(path, ref);
  if (!file) return null;
  if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string") {
    throw new Error(`تعذر قراءة الملف ${path} بأمان.`);
  }
  return { text: decodeBase64(file.content), sha: file.sha };
}

async function createBlob(text: string) {
  return await github(`/repos/${GITHUB_REPO}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: text, encoding: "utf-8" }),
  });
}

async function selectiveRevert(sha: string, actor: string) {
  const [target, currentRef] = await Promise.all([
    github(`/repos/${GITHUB_REPO}/commits/${sha}`),
    github(`/repos/${GITHUB_REPO}/git/ref/heads/${GITHUB_BRANCH}`),
  ]);

  const currentSha = currentRef?.object?.sha;
  if (!currentSha) throw new Error("تعذر تحديد الإصدار الحالي.");
  if (currentSha === target.sha) throw new Error("لا يمكن إلغاء الإصدار الحالي نفسه.");

  const parents = target?.parents || [];
  if (parents.length !== 1) throw new Error("لا يمكن إلغاء Commit دمج (Merge Commit) بهذه الطريقة الآمنة.");
  const parentSha = parents[0].sha;
  if (!parentSha) throw new Error("تعذر تحديد الإصدار السابق للتعديل.");

  const files = target.files || [];
  if (!files.length) throw new Error("هذا الإصدار لا يحتوي على تغييرات ملفية يمكن إلغاؤها.");
  if (files.length > 50) throw new Error("الإصدار يحتوي على عدد كبير جدًا من الملفات. تم إيقاف العملية للحماية.");

  const changes: { path: string; mode: string; type: "blob" | "delete"; content?: string }[] = [];

  for (const file of files) {
    const path = String(file.filename || "");
    if (!path) throw new Error("وجد ملف بدون مسار صالح.");
    const status = String(file.status || "modified");
    if (status === "renamed" || status === "copied") {
      throw new Error(`لا يمكن إلغاء Commit يحتوي على إعادة تسمية/نسخ للملف ${path} بأمان من الواجهة.`);
    }

    if (status === "modified") {
      if (typeof file.patch !== "string") throw new Error(`لا يوجد Patch كامل للملف ${path}؛ لم يتم تغيير النظام.`);
      const current = await getFileText(path, GITHUB_BRANCH);
      if (!current) throw new Error(`الملف ${path} غير موجود حاليًا؛ لم يتم تغيير النظام.`);
      const reverted = applyReversePatch(current.text, file.patch);
      if (reverted !== current.text) {
        changes.push({ path, mode: file.mode || "100644", type: "blob", content: reverted });
      }
      continue;
    }

    if (status === "added") {
      const current = await getFileText(path, GITHUB_BRANCH);
      const targetFile = await getFileText(path, target.sha);
      if (!targetFile) throw new Error(`تعذر قراءة الملف المضاف ${path}.`);
      if (!current || current.text !== targetFile.text) {
        throw new Error(`الملف ${path} تم تعديله بعد هذا الإصدار؛ لم يتم تغييره لتجنب فقدان التعديلات الأحدث.`);
      }
      changes.push({ path, mode: file.mode || "100644", type: "delete" });
      continue;
    }

    if (status === "deleted") {
      const current = await getFileText(path, GITHUB_BRANCH);
      const parentFile = await getFileText(path, parentSha);
      if (!parentFile) throw new Error(`تعذر قراءة النسخة السابقة من ${path}.`);
      if (current) throw new Error(`الملف ${path} موجود حاليًا بتعديل لاحق؛ لم يتم استبداله.`);
      changes.push({ path, mode: file.mode || "100644", type: "blob", content: parentFile.text });
      continue;
    }

    throw new Error(`نوع تغيير غير مدعوم للملف ${path}: ${status}. لم يتم تغيير النظام.`);
  }

  if (!changes.length) throw new Error("لا يوجد تغيير قابل للإلغاء؛ ربما تم إلغاء هذا التعديل بالفعل.");

  const currentCommit = await github(`/repos/${GITHUB_REPO}/commits/${currentSha}`);
  const baseTree = currentCommit?.commit?.tree?.sha;
  if (!baseTree) throw new Error("تعذر تحديد شجرة الإصدار الحالي.");

  const treeEntries = [];
  for (const change of changes) {
    if (change.type === "delete") {
      treeEntries.push({ path: change.path, mode: "100644", type: "blob", sha: null });
    } else {
      const blob = await createBlob(change.content || "");
      treeEntries.push({ path: change.path, mode: change.mode || "100644", type: "blob", sha: blob.sha });
    }
  }

  const tree = await github(`/repos/${GITHUB_REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTree, tree: treeEntries }),
  });
  if (!tree?.sha) throw new Error("تعذر إنشاء شجرة التعديل الآمن.");

  const shortSha = target.sha.slice(0, 10);
  const commit = await github(`/repos/${GITHUB_REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `Revert Farma commit ${shortSha} by ${actor}`,
      tree: tree.sha,
      parents: [currentSha],
    }),
  });
  if (!commit?.sha) throw new Error("تعذر إنشاء Commit الإلغاء.");

  const updatedRef = await github(`/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return { success: true, commit_sha: commit.sha, reverted_commit: target.sha, branch: GITHUB_BRANCH, ref: updatedRef?.object?.sha };
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
      return json({ versions: commits.map((c: any) => ({ sha: c.sha, message: (c.commit?.message || "").split("\n")[0], date: c.commit?.author?.date || c.commit?.committer?.date, author: c.author?.login || c.commit?.author?.name || "غير معروف", url: c.html_url })) });
    }

    if (action === "view_version") {
      const sha = String(payload?.sha || "");
      if (!/^[0-9a-f]{7,40}$/i.test(sha)) return json({ error: "Commit SHA غير صالح." }, 400);
      const commit = await github(`/repos/${GITHUB_REPO}/commits/${sha}`);
      return json({ sha: commit.sha, message: commit.commit?.message || "", date: commit.commit?.author?.date || commit.commit?.committer?.date, author: commit.author?.login || commit.commit?.author?.name || "غير معروف", files: (commit.files || []).map((f: any) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, changes: f.changes })) });
    }

    if (action === "restore_version") {
      const sha = String(payload?.sha || "");
      if (!/^[0-9a-f]{7,40}$/i.test(sha)) return json({ error: "Commit SHA غير صالح." }, 400);
      const [target, currentRef] = await Promise.all([github(`/repos/${GITHUB_REPO}/commits/${sha}`), github(`/repos/${GITHUB_REPO}/git/ref/heads/${GITHUB_BRANCH}`)]);
      const currentSha = currentRef?.object?.sha;
      if (!currentSha) throw new Error("تعذر تحديد الإصدار الحالي.");
      if (currentSha === target.sha) return json({ error: "هذا هو الإصدار الحالي بالفعل." }, 400);
      const treeSha = target?.commit?.tree?.sha;
      if (!treeSha) throw new Error("تعذر تحديد ملفات الإصدار المطلوب.");
      const shortSha = target.sha.slice(0, 10);
      const actor = profile?.full_name || user.email || user.id;
      const commit = await github(`/repos/${GITHUB_REPO}/git/commits`, { method: "POST", body: JSON.stringify({ message: `Restore Farma to version ${shortSha} by ${actor}`, tree: treeSha, parents: [currentSha] }) });
      const updatedRef = await github(`/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
      return json({ success: true, commit_sha: commit.sha, restored_from: target.sha, branch: GITHUB_BRANCH, ref: updatedRef?.object?.sha });
    }

    if (action === "revert_commit") {
      const sha = String(payload?.sha || "");
      if (!/^[0-9a-f]{7,40}$/i.test(sha)) return json({ error: "Commit SHA غير صالح." }, 400);
      const actor = profile?.full_name || user.email || user.id;
      return json(await selectiveRevert(sha, actor));
    }

    return json({ error: "عملية غير معروفة." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." }, 400);
  }
});
