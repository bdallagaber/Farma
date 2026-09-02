// ============================================================
// إعدادات الاتصال بـ Supabase - ملف مشترك تستخدمه كل صفحات السيستم
// ============================================================
const SUPABASE_URL = "https://xnppuzullfyxeqwxhyts.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XDFuq8hI4IEBRo-saeWRvQ_AP_U5WW0";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
    storageKey: 'farma-auth'
  }
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let farmaRedirectingToLogin = false;
let farmaLastKnownSession = null;
let farmaLastKnownProfile = null;

try {
  const cachedProfile = localStorage.getItem('farma-profile-cache');
  if (cachedProfile) farmaLastKnownProfile = JSON.parse(cachedProfile);
} catch (err) {
  console.warn('Could not restore cached profile:', err);
}

async function getStableSession() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { data, error } = await sb.auth.getSession();
      if (!error && data?.session) {
        farmaLastKnownSession = data.session;
        return data.session;
      }
    } catch (err) {
      console.warn('Session lookup attempt failed:', err);
    }
    await sleep(400 * (attempt + 1));
  }

  try {
    const { data, error } = await sb.auth.refreshSession();
    if (!error && data?.session) {
      farmaLastKnownSession = data.session;
      return data.session;
    }
    console.warn('Session refresh returned no session:', error);
  } catch (err) {
    console.warn('Session refresh failed:', err);
  }

  await sleep(1000);
  try {
    const { data, error } = await sb.auth.getSession();
    if (!error && data?.session) {
      farmaLastKnownSession = data.session;
      return data.session;
    }
  } catch (err) {
    console.warn('Final session restore failed:', err);
  }

  return null;
}

async function getStableProfile(userId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { data, error } = await sb
        .from('profiles')
        .select('role, full_name, allowed_pages')
        .eq('id', userId)
        .single();

      if (!error && data) {
        farmaLastKnownProfile = data;
        try {
          localStorage.setItem('farma-profile-cache', JSON.stringify(data));
        } catch (cacheErr) {
          console.warn('Could not cache profile:', cacheErr);
        }
        return data;
      }
      console.warn('Profile lookup attempt failed:', error);
    } catch (err) {
      console.warn('Profile lookup exception:', err);
    }

    await sleep(400 * (attempt + 1));
  }

  return null;
}

async function requireAuth() {
  const session = await getStableSession();

  if (!session) {
    await sleep(1500);
    const recoveredSession = await getStableSession();
    if (recoveredSession) return requireAuthWithSession(recoveredSession);

    // Only redirect after all recovery attempts fail. Never sign out here.
    if (!farmaRedirectingToLogin) {
      farmaRedirectingToLogin = true;
      window.location.replace('index.html');
    }
    return null;
  }

  return requireAuthWithSession(session);
}

async function requireAuthWithSession(session) {
  const profile = await getStableProfile(session.user.id);

  if (profile) return { user: session.user, profile };

  // A temporary database/network outage must not destroy the user's access.
  // Reuse the last verified permissions for this browser session if available.
  if (farmaLastKnownProfile) {
    console.warn('Profile temporarily unavailable; using last verified profile.');
    return { user: session.user, profile: farmaLastKnownProfile };
  }

  // No cached permissions exist yet. Keep the authenticated session alive,
  // but do not grant admin privileges as a fallback.
  return {
    user: session.user,
    profile: {
      role: 'employee',
      full_name: session.user.email || 'مستخدم',
      allowed_pages: []
    }
  };
}

// لا نعملش redirect من onAuthStateChange.
sb.auth.onAuthStateChange((event, session) => {
  if (session) farmaLastKnownSession = session;
  console.debug('Farma auth event:', event, session ? 'session-present' : 'no-session');
});

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
  link.href = 'sidebar.css?v=3';
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
  const byHref = {};
  links.forEach(a => { byHref[a.getAttribute('href')] = a; });

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
      const icon = href === 'inventory.html' ? '📋' : href === 'shortages.html' ? '⚠️' : href === 'sales.html' ? '🧾' : '📑';
      a.innerHTML = '<span>' + icon + '</span><span>' + label + '</span>';
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
    const label = href === 'users.html' ? fallbackLabel : (a.textContent.trim() || fallbackLabel);
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

// ============================================================
// تحميل تحسينات صفحة المخزون
// ============================================================
(function loadInventoryEnhancements() {
  const isInventoryPage = /(^|\/)inventory\.html$/i.test(window.location.pathname);
  if (!isInventoryPage) return;
  if (document.getElementById('farmaInventoryEnhancements')) return;

  const script = document.createElement('script');
  script.id = 'farmaInventoryEnhancements';
  script.src = 'inventory-enhancements.js?v=1';
  document.head.appendChild(script);
})();

// ============================================================
// إصلاح فلترة المبيعات حسب تاريخ القاهرة
// ============================================================
(function installCairoSalesDateFix() {
  const isSalesPage = /(^|\/)sales\.html$/i.test(window.location.pathname);
  if (!isSalesPage) return;

  const cairoParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const getPart = type => {
    const part = cairoParts.find(p => p.type === type);
    return part ? part.value : '';
  };

  const cairoToday = {
    year: Number(getPart('year')),
    month: Number(getPart('month')),
    day: Number(getPart('day'))
  };

  const cairoStartIso = (year, month, day) => {
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - (3 * 60 * 60 * 1000)).toISOString();
  };

  const shiftCairoDate = (year, month, day, deltaDays) => {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + deltaDays);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate()
    };
  };

  const originalGetRangeStart = window.getRangeStart;

  setTimeout(() => {
    window.getRangeStart = function(range) {
      if (range === 'today') {
        return cairoStartIso(cairoToday.year, cairoToday.month, cairoToday.day);
      }
      if (range === 'week') {
        const start = shiftCairoDate(cairoToday.year, cairoToday.month, cairoToday.day, -7);
        return cairoStartIso(start.year, start.month, start.day);
      }
      if (range === 'month') {
        const start = new Date(Date.UTC(cairoToday.year, cairoToday.month - 1, cairoToday.day));
        start.setUTCMonth(start.getUTCMonth() - 1);
        return cairoStartIso(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate());
      }
      return typeof originalGetRangeStart === 'function' ? originalGetRangeStart(range) : null;
    };

    if (typeof window.loadRecentSales === 'function') {
      window.loadRecentSales();
    }
  }, 0);
})();
