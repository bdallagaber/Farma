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
    if (key === 'users') {
      a.style.display = 'none'; // صفحة الإعدادات/المستخدمين أدمن بس دايمًا، منعًا لثغرة ترقية صلاحيات ذاتية
    } else if (!allowed.includes(key)) {
      a.style.display = 'none';
    }
  });

  if (!allowed.includes(pageKey)) {
    document.body.innerHTML =
      '<div style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#6b7684;">' +
      'مفيش صلاحية لدخول القسم ده. <a href="' + (allowed[0] || 'index') + '.html" style="color:#0d9488;">ارجع للصفحة المسموحة</a>' +
      '</div>';
    return false;
  }
  return true;
}

// تفعيل القائمة الجانبية (فتح/قفل على الموبايل) - شغالة تلقائي في كل الصفحات
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('menuToggle');
  const sidebar = document.querySelector('nav');
  const overlay = document.getElementById('sidebarOverlay');
  if (!toggle || !sidebar || !overlay) return;

  // زرار قفل واضح جوه القايمة نفسها (يظهر بس على الموبايل، الـCSS بيتحكم في ده)
  const closeBtn = document.createElement('button');
  closeBtn.id = 'navClose';
  closeBtn.textContent = '✕ قفل';
  sidebar.insertBefore(closeBtn, sidebar.firstChild);

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    document.body.classList.add('nav-locked');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    document.body.classList.remove('nav-locked');
  }
  toggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  closeBtn.addEventListener('click', closeSidebar);
  overlay.addEventListener('click', closeSidebar);
  sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', closeSidebar));

  // لو الشاشة اتكبرت لحجم كمبيوتر وهي مفتوحة، نشيل حالة "القفل" لأن القايمة بقت ثابتة أصلاً
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 900) closeSidebar();
  });
});
