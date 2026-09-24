import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TZ = "Africa/Cairo";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const cairoDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function addDays(dateStr: string, days: number) { const [y, m, d] = dateStr.split("-").map(Number); const date = new Date(Date.UTC(y, m - 1, d)); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

async function pushToUser(userId: string, notification: any, config: any) {
  const { data: subscriptions } = await supabase.from("attendance_push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).limit(50);
  let sent = 0;
  const stale: string[] = [];
  for (const subscription of subscriptions || []) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: notification.title, body: notification.body, tag: `farma-${notification.type}-${notification.id}`, data: { url: notification.link, notification_id: notification.id } }));
      sent += 1;
    } catch (error) {
      const statusCode = Number((error as any)?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) stale.push(subscription.id);
    }
  }
  if (stale.length) await supabase.from("attendance_push_subscriptions").delete().in("id", stale);
  if (sent > 0) await supabase.from("app_notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", notification.id);
  return sent;
}

async function createAndSend(input: { userId: string; type: string; title: string; body: string; link: string; entityId?: string | null; dedupeKey: string }, config: any) {
  const { data: notification, error } = await supabase.from("app_notifications").insert({ user_id: input.userId, type: input.type, title: input.title, body: input.body, link: input.link, entity_id: input.entityId || null, dedupe_key: input.dedupeKey }).select("id, title, body, link, type").single();
  if (error) {
    if (String(error.code) === "23505") return { created: false, sent: 0 };
    throw error;
  }
  return { created: true, sent: await pushToUser(input.userId, notification, config) };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { data: config, error: configError } = await supabase.from("attendance_push_config").select("vapid_public_key, vapid_private_key, subject, cron_secret").eq("id", true).single();
  if (configError || !config) return json({ error: "Push configuration is incomplete" }, 500);
  if (req.headers.get("x-cron-secret") !== config.cron_secret) return json({ error: "Unauthorized" }, 401);
  webpush.setVapidDetails(config.subject, config.vapid_public_key, config.vapid_private_key);

  const today = cairoDate();
  const expiryLimit = addDays(today, 30);
  const [{ data: admins, error: adminError }, { data: employees, error: employeeError }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "admin").limit(100),
    supabase.from("profiles").select("id, full_name").eq("role", "employee").limit(500),
  ]);
  if (adminError || employeeError) return json({ error: adminError?.message || employeeError?.message }, 500);

  let created = 0;
  let pushed = 0;
  const results: any[] = [];
  const adminList = admins || [];
  const employeeList = employees || [];

  const { data: pendingRequests } = await supabase.from("attendance_requests").select("id, employee_id, request_type, request_other, start_date, created_at, profiles:employee_id(full_name)").eq("status", "pending").order("created_at", { ascending: false }).limit(500);
  for (const request of pendingRequests || []) {
    const employeeName = request.profiles?.full_name || "موظف";
    for (const admin of adminList) {
      const result = await createAndSend({ userId: admin.id, type: "request_pending", title: "طلب موظف جديد", body: `${employeeName} أرسل طلبًا جديدًا للمراجعة.`, link: `/attendance.html?notification=request-${request.id}`, entityId: request.id, dedupeKey: `request_pending_${request.id}_${admin.id}` }, config);
      if (result.created) { created += 1; pushed += result.sent; results.push({ type: "request_pending", user: admin.id, sent: result.sent }); }
    }
  }

  const { data: decidedRequests } = await supabase.from("attendance_requests").select("id, employee_id, request_type, start_date, status, admin_note, updated_at").in("status", ["approved", "rejected"]).order("updated_at", { ascending: false }).limit(500);
  for (const request of decidedRequests || []) {
    const statusText = request.status === "approved" ? "تم قبول" : "تم رفض";
    const typeText: Record<string, string> = { leave: "طلب الإجازة", late_permission: "طلب إذن التأخير", early_leave: "طلب الانصراف المبكر", other: "الطلب" };
    const result = await createAndSend({ userId: request.employee_id, type: "request_decision", title: "تحديث على طلبك", body: `${statusText} ${typeText[request.request_type] || "الخاص بك"}.`, link: `/attendance.html?notification=request-${request.id}`, entityId: request.id, dedupeKey: `request_decision_${request.id}_${request.status}` }, config);
    if (result.created) { created += 1; pushed += result.sent; results.push({ type: "request_decision", user: request.employee_id, sent: result.sent }); }
  }

  const { data: stockRows } = await supabase.from("inventory").select("product_id, quantity_smallest_unit, products:product_id(id, name, min_stock_threshold)").limit(2000);
  for (const row of stockRows || []) {
    const product = row.products;
    if (!product) continue;
    const quantity = Number(row.quantity_smallest_unit || 0);
    const threshold = Number(product.min_stock_threshold || 0);
    let type = "";
    let title = "";
    let body = "";
    if (quantity <= 0) { type = "stock_out"; title = "صنف نفد من المخزون"; body = `الصنف ${product.name} انتهى من المخزون.`; }
    else if (threshold > 0 && quantity <= threshold) { type = "stock_low"; title = "صنف أوشك على النفاذ"; body = `الصنف ${product.name} وصل إلى ${quantity} وحدة، أقل من الحد الأدنى.`; }
    if (!type) continue;
    for (const admin of adminList) {
      const result = await createAndSend({ userId: admin.id, type, title, body, link: `/inventory.html?notification=stock-${product.id}`, entityId: product.id, dedupeKey: `${type}_${product.id}_${today}_${admin.id}` }, config);
      if (result.created) { created += 1; pushed += result.sent; results.push({ type, user: admin.id, sent: result.sent }); }
    }
  }

  const { data: expiringProducts } = await supabase.from("products").select("id, name, expiry_date").not("expiry_date", "is", null).gte("expiry_date", today).lte("expiry_date", expiryLimit).limit(2000);
  for (const product of expiringProducts || []) {
    for (const admin of adminList) {
      const result = await createAndSend({ userId: admin.id, type: "expiry_near", title: "صلاحية صنف قريبة", body: `الصنف ${product.name} تنتهي صلاحيته في ${product.expiry_date}.`, link: `/inventory.html?notification=expiry-${product.id}`, entityId: product.id, dedupeKey: `expiry_near_${product.id}_${product.expiry_date}_${admin.id}` }, config);
      if (result.created) { created += 1; pushed += result.sent; results.push({ type: "expiry_near", user: admin.id, sent: result.sent }); }
    }
  }

  return json({ ok: true, checked_at: new Date().toISOString(), created, pushed, results });
});
