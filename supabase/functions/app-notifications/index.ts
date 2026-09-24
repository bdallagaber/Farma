import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TZ = "Africa/Cairo";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const cairoDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function addDays(dateStr: string, days: number) { const [y, m, d] = dateStr.split("-").map(Number); const date = new Date(Date.UTC(y, m - 1, d)); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

type Candidate = { user_id: string; type: string; title: string; body: string; link: string; entity_id?: string | null; dedupe_key: string };

async function sendPushes(notifications: any[], config: any) {
  if (!notifications.length) return { pushed: 0 };
  const userIds = [...new Set(notifications.map((n) => n.user_id))];
  const { data: subscriptions } = await supabase.from("attendance_push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds).limit(5000);
  const byUser = new Map<string, any[]>();
  for (const subscription of subscriptions || []) byUser.set(subscription.user_id, [...(byUser.get(subscription.user_id) || []), subscription]);
  const sentIds: string[] = [];
  const stale: string[] = [];
  let pushed = 0;
  for (const notification of notifications) {
    const userSubscriptions = byUser.get(notification.user_id) || [];
    const results = await Promise.allSettled(userSubscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: notification.title, body: notification.body, tag: `farma-${notification.type}-${notification.id}`, data: { url: notification.link, notification_id: notification.id } }));
        return true;
      } catch (error) {
        const statusCode = Number((error as any)?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) stale.push(subscription.id);
        return false;
      }
    }));
    const sent = results.some((result) => result.status === "fulfilled" && result.value === true);
    if (sent) { pushed += 1; sentIds.push(notification.id); }
  }
  if (stale.length) await supabase.from("attendance_push_subscriptions").delete().in("id", stale);
  if (sentIds.length) await supabase.from("app_notifications").update({ push_sent_at: new Date().toISOString() }).in("id", sentIds);
  return { pushed };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { data: config, error: configError } = await supabase.from("attendance_push_config").select("vapid_public_key, vapid_private_key, subject, cron_secret").eq("id", true).single();
  if (configError || !config) return json({ error: "Push configuration is incomplete" }, 500);
  if (req.headers.get("x-cron-secret") !== config.cron_secret) return json({ error: "Unauthorized" }, 401);
  webpush.setVapidDetails(config.subject, config.vapid_public_key, config.vapid_private_key);

  const today = cairoDate();
  const expiryLimit = addDays(today, 30);
  const [{ data: admins, error: adminError }, { data: pendingRequests, error: pendingError }, { data: decidedRequests, error: decidedError }, { data: stockRows, error: stockError }, { data: expiringProducts, error: expiryError }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "admin").limit(100),
    supabase.from("attendance_requests").select("id, employee_id, request_type, start_date, created_at, profiles:employee_id(full_name)").eq("status", "pending").order("created_at", { ascending: false }).limit(500),
    supabase.from("attendance_requests").select("id, employee_id, request_type, start_date, status, updated_at").in("status", ["approved", "rejected"]).order("updated_at", { ascending: false }).limit(500),
    supabase.from("inventory").select("product_id, quantity_smallest_unit, products:product_id(id, name, min_stock_threshold)").limit(2000),
    supabase.from("products").select("id, name, expiry_date").not("expiry_date", "is", null).gte("expiry_date", today).lte("expiry_date", expiryLimit).limit(2000),
  ]);
  const queryError = adminError || pendingError || decidedError || stockError || expiryError;
  if (queryError) return json({ error: queryError.message }, 500);
  const adminList = admins || [];
  const candidates: Candidate[] = [];
  const addForAdmins = (base: Omit<Candidate, "user_id">) => { for (const admin of adminList) candidates.push({ ...base, user_id: admin.id, dedupe_key: `${base.dedupe_key}_${admin.id}` }); };

  for (const request of pendingRequests || []) {
    const employeeName = request.profiles?.full_name || "موظف";
    addForAdmins({ type: "request_pending", title: "طلب موظف جديد", body: `${employeeName} أرسل طلبًا جديدًا للمراجعة.`, link: `/attendance.html?notification=request-${request.id}`, entity_id: request.id, dedupe_key: `request_pending_${request.id}` });
  }
  const typeText: Record<string, string> = { leave: "طلب الإجازة", late_permission: "طلب إذن التأخير", early_leave: "طلب الانصراف المبكر", other: "الطلب" };
  for (const request of decidedRequests || []) candidates.push({ user_id: request.employee_id, type: "request_decision", title: "تحديث على طلبك", body: `${request.status === "approved" ? "تم قبول" : "تم رفض"} ${typeText[request.request_type] || "الخاص بك"}.`, link: `/attendance.html?notification=request-${request.id}`, entity_id: request.id, dedupe_key: `request_decision_${request.id}_${request.status}` });

  for (const row of stockRows || []) {
    const product = row.products; if (!product) continue;
    const quantity = Number(row.quantity_smallest_unit || 0); const threshold = Number(product.min_stock_threshold || 0);
    if (quantity <= 0) addForAdmins({ type: "stock_out", title: "صنف نفد من المخزون", body: `الصنف ${product.name} انتهى من المخزون.`, link: `/inventory.html?notification=stock-${product.id}`, entity_id: product.id, dedupe_key: `stock_out_${product.id}_${today}` });
    else if (threshold > 0 && quantity <= threshold) addForAdmins({ type: "stock_low", title: "صنف أوشك على النفاذ", body: `الصنف ${product.name} وصل إلى ${quantity} وحدة، أقل من الحد الأدنى.`, link: `/inventory.html?notification=stock-${product.id}`, entity_id: product.id, dedupe_key: `stock_low_${product.id}_${today}` });
  }
  for (const product of expiringProducts || []) addForAdmins({ type: "expiry_near", title: "صلاحية صنف قريبة", body: `الصنف ${product.name} تنتهي صلاحيته في ${product.expiry_date}.`, link: `/inventory.html?notification=expiry-${product.id}`, entity_id: product.id, dedupe_key: `expiry_near_${product.id}_${product.expiry_date}` });

  const unique = [...new Map(candidates.map((candidate) => [candidate.dedupe_key + "_" + candidate.user_id, candidate])).values()];
  let inserted: any[] = [];
  if (unique.length) {
    const { data, error } = await supabase.from("app_notifications").upsert(unique, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id, user_id, type, title, body, link");
    if (error) return json({ error: error.message }, 500);
    inserted = data || [];
  }
  const { pushed } = await sendPushes(inserted, config);
  return json({ ok: true, checked_at: new Date().toISOString(), candidates: unique.length, created: inserted.length, pushed });
});
