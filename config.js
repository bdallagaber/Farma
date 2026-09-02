// ============================================================
// إعدادات الاتصال بـ Supabase - ملف مشترك تستخدمه كل صفحات السيستم
// ============================================================
const SUPABASE_URL = "https://xnppuzullfyxeqwxhyts.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ4bnBwdXp1bGxm eXFlcXd4eXRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NTkyNzEsImV4cCI6MjEwMTUzNTI3MX0.kWCN1qai3IcbkiD30Ng-SmyqJGqTl6BHskNrcDJnEU8";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

function guardPageAccess(profile, pageKey) {
  if (profile.role === 'admin') return true;

  const allowed = profile.allowed_pages || [];

  document.querySelectorAll('nav a[href$=".html"]').forEach(a => {
    const key = a.getAttribute('href').replace('.html', '');
    if (key === 'users') {
      a.style.display = 'none';
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

// ============================================================
// Sidebar - تصميم قريب من Daftra مع دعم الكمبيوتر والموبايل
// ============================================================
(function loadSidebarStyles() {
  if (document.getElementById('farmaSidebarCss')) return;
  const link = document.createElement('link');
  link.id = 'farmaSidebarCss';
  link.rel = 'stylesheet';
  link.href = 'sidebar.css?v=2';
  document.head.appendChild(link);
})();

function setupFarmaSidebar() {
  const sidebar = document.querySelector('nav');
  if (!sidebar) return;

  document.body.classList.add('farma-sidebar-ready');

  const links = Array.from(sidebar.querySelectorAll('a[href$=".html"]'));
  if (!links.length || sidebar.dataset.farmaBuilt === '1') return;
  sidebar.dataset.farmaBuilt = '1';

  const currentFile = (location.pathname.split('/').pop() || 'inventory.html').toLowerCase();

  // حفظ الروابط الأصلية قبل إعادة تنظيمها.
  const byHref = {};
  links.forEach(a => {
    byHref[a.getAttribute('href')] = a;
  });

  sidebar.innerHTML = '';

  const brand = document.createElement('div');
  brand.className = 'farma-sidebar-brand';
  brand.innerHTML = '<div class="farma-sidebar-brand-logo">F</div><div class="farma-sidebar-brand-text">Farma<small>إدارة الصيدلية</small></div>';
  sidebar.appendChild(brand);

  const collapse = document.createElement('button');
  collapse.type = 'button';
  collapse.className = 'farma-nav-collapse';
  collapse.title = 'تصغير القائمة';
  collapse.textContent = '‹';
  sidebar.appendChild(collapse);

  const home = byHref['index.html'];
  if (home) {
    home.classList.add('farma-nav-home');
    home.innerHTML = '<span>🏠</span><span>الرئيسية</span>';
    sidebar.appendChild(home);
  }

  const groups = [
    { title: 'المخزون', icon: '📦', hrefs: ['inventory.html', 'shortages.html'] },
    { title: 'المبيعات', icon: '🛒', hrefs: ['sales.html', 'invoices.html'] }
  ];

  function addGroup(group) {
    const existing = group.hrefs.map(h => byHref[h]).filter(Boolean);
    if (!existing.length) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'farma-nav-group';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'farma-nav-group-toggle';
    toggle.innerHTML = '<span class="farma-nav-group-title"><span>' + group.icon + '</span><span>' + group.title + '</span></span><span class="farma-nav-chevron">›</span>';

    const sub = document.createElement('div');
    sub.className = 'farma-nav-sub';
    const inner = document.createElement('div');
    inner.className = 'farma-nav-sub-inner';

    let hasCurrent = false;
    existing.forEach(a => {
      const href = a.getAttribute('href');
      const label = a.textContent.trim();
      a.innerHTML = '<span>' + (href === 'inventory.html' ? '📋' : href === 'shortages.html' ? '⚠️' : href === 'sales.html' ? '🧾' : '📑') + '</span><span>' + label + '</span>';
      if (href.toLowerCase() === currentFile || a.classList.contains('active')) {
        a.classList.add('active');
        hasCurrent = true;
      }
      inner.appendChild(a);
    });

    sub.appendChild(inner);
    wrapper.appendChild(toggle);
    wrapper.appendChild(sub);
    sidebar.appendChild(wrapper);

    if (hasCurrent) wrapper.classList.add('open');
    toggle.addEventListener('click', () => wrapper.classList.toggle('open'));
  }

  groups.forEach(addGroup);

  const singles = [
    ['expenses.html', '💳', 'المصروفات'],
    ['profit.html', '📊', 'الأرباح والتقارير'],
    ['search.html', '🔎', 'البحث عن دواء'],
    ['users.html', '👥', 'المستخدمون']
  ];

  singles.forEach(([href, icon, fallbackLabel]) => {
    const a = byHref[href];
    if (!a) return;
    const label = a.textContent.trim() || fallbackLabel;
    a.innerHTML = '<span>' + icon + '</span><span>' + label + '</span>';
    if (href.toLowerCase() === currentFile || a.classList.contains('active')) a.classList.add('active');
    sidebar.appendChild(a);
  });

  function setCollapsed(collapsed) {
    document.body.classList.toggle('farma-sidebar-collapsed', collapsed);
    collapse.textContent = collapsed ? '›' : '‹';
    collapse.title = collapsed ? 'توسيع القائمة' : 'تصغير القائمة';
    localStorage.setItem('farmaSidebarCollapsed', collapsed ? '1' : '0');
  }

  const saved = localStorage.getItem('farmaSidebarCollapsed') === '1';
  setCollapsed(saved);
  collapse.addEventListener('click', () => {
    setCollapsed(!document.body.classList.contains('farma-sidebar-collapsed'));
  });

  const overlay = document.getElementById('sidebarOverlay');
  const toggleMobile = document.getElementById('menuToggle');
  if (overlay && toggleMobile) {
    const closeMobile = () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
      document.body.classList.remove('nav-locked');
    };
    toggleMobile.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
      document.body.classList.toggle('nav-locked', sidebar.classList.contains('open'));
    });
    overlay.addEventListener('click', closeMobile);
    sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobile));
  }
}

document.addEventListener('DOMContentLoaded', setupFarmaSidebar);
