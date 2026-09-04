/* ============================================================
   Farma - Core inventory performance layer
   Safe hot-path optimization. No pagination, no data/business changes.
============================================================ */
(function () {
  'use strict';
  if (!/(^|\/)inventory\.html$/i.test(window.location.pathname)) return;

  const arCollator = new Intl.Collator('ar', { sensitivity: 'base', numeric: true, ignorePunctuation: true });
  const enCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true, ignorePunctuation: true });
  const searchCache = new WeakMap();

  function normalize(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/\s+/g, '');
  }
  function cachedSearchText(p) {
    let value = searchCache.get(p);
    if (value === undefined) {
      value = normalize((p.name || '') + ' ' + (p.name_en || ''));
      searchCache.set(p, value);
    }
    return value;
  }
  function fastMatch(normalizedHaystack, term) {
    if (!term) return true;
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return true;
    if (normalizedHaystack.includes(normalizedTerm)) return true;
    const words = String(term).trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      if (!normalizedHaystack.includes(normalize(words[i]))) return false;
    }
    return words.length > 1;
  }

  function installWhenReady() {
    if (typeof window.renderInventoryTable !== 'function') return false;

    window.fuzzyIncludes = function (haystack, term) {
      return fastMatch(normalize(haystack), term);
    };

    window.compareProductsByName = function (a, b, sortMode) {
      const arabic = String(sortMode || '').startsWith('ar_');
      const ascending = String(sortMode || '').endsWith('_asc');
      const field = arabic ? 'name' : 'name_en';
      const av = String(a?.[field] || '').trim();
      const bv = String(b?.[field] || '').trim();
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const result = (arabic ? arCollator : enCollator).compare(av, bv);
      return ascending ? result : -result;
    };

    window.updateFilterOptionCounts = function (term) {
      const products = window._productsCache || [];
      const filters = typeof window.getFilterState === 'function'
        ? window.getFilterState()
        : { shape: [], type: [], class: [], avail: [] };
      const wantedTerm = String(term || '').trim();
      const shapeCounts = new Map();
      const typeCounts = new Map();
      const classCounts = new Map();

      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (wantedTerm && !fastMatch(cachedSearchText(p), wantedTerm)) continue;
        if (filters.type.length && !filters.type.includes(p.drug_type)) continue;
        if (filters.class.length) {
          const u = !p.classification;
          if (!filters.class.includes(p.classification) && !(u && filters.class.includes('__unclassified__'))) continue;
        }
        if (filters.avail.length && typeof window.getAvailabilityState === 'function') {
          const s = window.getAvailabilityState(p);
          if (!((filters.avail.includes('available') && s.available) || (filters.avail.includes('unavailable') && s.unavailable) || (filters.avail.includes('low') && s.low))) continue;
        }
        const key = p.shape || '__unclassified__';
        shapeCounts.set(key, (shapeCounts.get(key) || 0) + 1);
      }

      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (wantedTerm && !fastMatch(cachedSearchText(p), wantedTerm)) continue;
        if (filters.shape.length && !filters.shape.includes(p.shape)) continue;
        if (filters.class.length) {
          const u = !p.classification;
          if (!filters.class.includes(p.classification) && !(u && filters.class.includes('__unclassified__'))) continue;
        }
        if (filters.avail.length && typeof window.getAvailabilityState === 'function') {
          const s = window.getAvailabilityState(p);
          if (!((filters.avail.includes('available') && s.available) || (filters.avail.includes('unavailable') && s.unavailable) || (filters.avail.includes('low') && s.low))) continue;
        }
        const key = p.drug_type || '__unclassified__';
        typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
      }

      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (wantedTerm && !fastMatch(cachedSearchText(p), wantedTerm)) continue;
        if (filters.shape.length && !filters.shape.includes(p.shape)) continue;
        if (filters.type.length && !filters.type.includes(p.drug_type)) continue;
        if (filters.avail.length && typeof window.getAvailabilityState === 'function') {
          const s = window.getAvailabilityState(p);
          if (!((filters.avail.includes('available') && s.available) || (filters.avail.includes('unavailable') && s.unavailable) || (filters.avail.includes('low') && s.low))) continue;
        }
        const key = p.classification || '__unclassified__';
        classCounts.set(key, (classCounts.get(key) || 0) + 1);
      }

      const write = (className, map) => document.querySelectorAll('.' + className).forEach(chk => {
        const span = chk.parentElement?.querySelector('.filter-option-count');
        if (span) span.textContent = '(' + (map.get(chk.value) || 0) + ')';
      });
      write('shapeChk', shapeCounts);
      write('typeChk', typeCounts);
      write('classChk', classCounts);
    };
    return true;
  }

  const timer = setInterval(() => {
    try { if (installWhenReady()) clearInterval(timer); }
    catch (e) { console.error('Farma inventory core performance:', e); }
  }, 25);
  setTimeout(() => clearInterval(timer), 15000);
})();