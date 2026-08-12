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
    .select('role, full_name, allowed_pages')
    .eq('id', session.user.id)
    .single();
  if (error || !profile) {
    window.location.href = 'index.html';
    return null;
  }
  return { user: session.user, profile };
}

// دالة مشتركة: تتحقق إن الموظف (مش الأدمن) مسموحله يدخل الصفحة دي بالذات، وتخفي روابط الأقسام غير المسموحة من القائمة
// pageKey مثال: 'inventory', 'sales', 'shortages'
function guardPageAccess(profile, pageKey) {
  if (profile.role === 'admin') return true; // الأدمن يشوف كل حاجة دايمًا

  const allowed = profile.allowed_pages || [];

  // إخفاء روابط الأقسام غير المسموحة من القائمة العلوية
  document.querySelectorAll('nav a[href$=".html"]').forEach(a => {
    const key = a.getAttribute('href').replace('.html', '');
    if (['expenses', 'profit', 'users'].includes(key)) {
      a.style.display = 'none'; // دايمًا أدمن بس، بغض النظر عن allowed_pages
    } else if (!allowed.includes(key)) {
      a.style.display = 'none';
    }
  });

  if (!allowed.includes(pageKey)) {
    document.body.innerHTML =
      '<div style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#9fb3a8;">' +
      'مفيش صلاحية لدخول القسم ده. <a href="' + (allowed[0] || 'index') + '.html" style="color:#6fcf97;">ارجع للصفحة المسموحة</a>' +
      '</div>';
    return false;
  }
  return true;
}
