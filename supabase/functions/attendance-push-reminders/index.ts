import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TZ = "Africa/Cairo";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

function cairoParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function cairoDate(date = new Date()) {
  const p = cairoParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localCairoToUtc(dateStr: string, timeStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss = "0"] = String(timeStr).split(":");
  const desired = Date.UTC(y, m - 1, d, Number(hh), Number(mm), Number(ss));
  let utc = desired;
  for (let i = 0; i < 3; i += 1) {
    const p = cairoParts(new Date(utc));
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    utc += desired - actual;
  }
  return new Date(utc);
}

function inWindow(now: Date, start: Date, end: Date) {
  return now.getTime() >= start.getTime() && now.getTime() < end.getTime();
}

async function getShift(userId: string, workDate: string) {
  const { data, error } = await supabase.rpc("get_employee_shift", { p_employee: userId, p_date: workDate });
  if (error) throw error;
  return data?.[0] || null;
}

async function sendReminder(user: any, workDate: string, kind: string, payload: any, now: Date) {
  const { error: claimError } = await supabase.from("attendance_push_deliveries").insert({
    user_id: user.id,
    work_date: workDate,
    kind,
  });
  if (claimError) {
    // The unique key makes this idempotent when the scheduler runs more than once.
    if (String(claimError.code) === "23505") return { skipped: true };
    throw claimError;
  }

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("attendance_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id)
    .limit(50);
  if (subscriptionError) throw subscriptionError;
  if (!subscriptions?.length) return { sent: 0 };

  let sent = 0;
  const stale: string[] = [];
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      const statusCode = Number((error as any)?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) stale.push(subscription.id);
    }
  }
  if (stale.length) await supabase.from("attendance_push_subscriptions").delete().in("id", stale);
  if (sent === 0) await supabase.from("attendance_push_deliveries").delete().eq("user_id", user.id).eq("work_date", workDate).eq("kind", kind);
  return { sent, at: now.toISOString() };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { data: config, error: configError } = await supabase
    .from("attendance_push_config")
    .select("vapid_public_key, vapid_private_key, subject, cron_secret")
    .eq("id", true)
    .single();
  if (configError || !config) return json({ error: "Push configuration is incomplete" }, 500);
  if (req.headers.get("x-cron-secret") !== config.cron_secret) return json({ error: "Unauthorized" }, 401);

  webpush.setVapidDetails(config.subject, config.vapid_public_key, config.vapid_private_key);
  const now = new Date();
  const today = cairoDate(now);
  const dates = [today, addDays(today, -1)];
  const { data: users, error: usersError } = await supabase.from("profiles").select("id, full_name").eq("role", "employee").limit(500);
  if (usersError) return json({ error: usersError.message }, 500);

  const results: any[] = [];
  for (const user of users || []) {
    for (const workDate of dates) {
      const shift = await getShift(user.id, workDate);
      if (!shift?.shift_id) continue;
      const start = localCairoToUtc(workDate, shift.start_time);
      let end = localCairoToUtc(workDate, shift.end_time);
      if (shift.end_time <= shift.start_time) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);

      const { data: attendance } = await supabase.from("attendance")
        .select("check_in, check_out")
        .eq("employee_id", user.id)
        .eq("work_date", workDate)
        .limit(1);
      const row = attendance?.[0];
      const base = { url: "/attendance.html?push=attendance", user_id: user.id, work_date: workDate };
      let kind = "";
      let title = "";
      let body = "";
      if (!row?.check_in && inWindow(now, new Date(start.getTime() - 10 * 60_000), start)) {
        kind = "check_in_10"; title = "تذكير الحضور"; body = `حان موعد تسجيل حضورك لشيفت ${shift.shift_name}.`;
      } else if (!row?.check_in && inWindow(now, new Date(start.getTime() + 15 * 60_000), new Date(start.getTime() + 20 * 60_000))) {
        kind = "check_in_overdue"; title = "تسجيل الحضور"; body = "لم يتم تسجيل حضورك بعد بداية الشيفت، برجاء تسجيل الحضور.";
      } else if (row?.check_in && !row?.check_out && inWindow(now, new Date(end.getTime() - 10 * 60_000), end)) {
        kind = "check_out_10"; title = "تذكير الانصراف"; body = "متبقي 10 دقائق على نهاية شيفتك، تذكر تسجيل الانصراف.";
      } else if (row?.check_in && !row?.check_out && inWindow(now, end, new Date(end.getTime() + 10 * 60_000))) {
        kind = "check_out_overdue"; title = "تسجيل الانصراف"; body = "انتهت الشيفت ولم يتم تسجيل الانصراف، برجاء تسجيله.";
      }
      if (kind) results.push({ user: user.full_name, kind, ...(await sendReminder(user, workDate, kind, { title, body, tag: `farma-${kind}-${workDate}`, data: { ...base, kind } }, now)) });
    }
  }
  return json({ ok: true, checked_at: now.toISOString(), reminders: results });
});
