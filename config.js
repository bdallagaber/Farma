// ============================================================
// إعدادات الاتصال بـ Supabase - ملف مشترك تستخدمه كل صفحات السيستم
// ============================================================
const SUPABASE_URL = "https://xnppuzullfyxeqwxhyts.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucHB1enVsbGZ5eGVxd3hoeXRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NTkyNzEsImV4cCI6MjEwMTUzNTI3MX0.kWCN1qai3IcbkiD30Ng-SmyqJGqTl6BHskNrcDJnEU8";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// دالة مشتركة: تتأكد إن المستخدم مسجّل دخول، ولو لأ ترجعه لصفحة تسجيل الدخول
async function requireAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  const { data: profile, error } = await sb
    .from('profiles')
    .select('role, full_name')
    .eq('id', session.user.id)
    .single();
  if (error || !profile) {
    window.location.href = 'index.html';
    return null;
  }
  return { user: session.user, profile };
}
