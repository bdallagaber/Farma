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
  const availabilityCache = new WeakMap();

  function normalize(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/\s+/g, '');
  }

  function cachedSearchText(product) {
    let value = searchCache.get(product);
    if (value === undefined) {
      value = normalize((product.name || '') + ' ' + (product.name_en || ''));
      searchCache.set(product, value);
    }
    return value;
  }

  function fastMatch(normalizedHaystack, term) {
    if (!term) return true;
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return true;
    if (normalizedHaystack.includes(normalizedTerm)) return true;
    const words = String(term).trim().split(/\s+/).filter(Boolean);
    if (words.length <= 1) return false;
    for (let i = 0; i < words.length; i++) {
      if (!normalizedHaystack.includes(normalize(words[i]))) return false;
    }
    return true;
  }

  function productSearchMatch(product, term) {
    return fastMatch(cachedSearchText(product), term);
  }

  function availabilityState(product) {
    let state = availabilityCache.get(product);
    if (state !== undefined) return state;

    const inv = product.inventory;
    const qty = Array.isArray(inv)
      ? Number(inv[0]?.quantity_smallest_unit) || 0
      : Number(inv?.quantity_smallest_unit) || 0;
    const threshold = Number(product.min_stock_threshold) || 0;

    state = {
      available: qty > threshold,
      low: qty > 0 && qty <= threshold,
      unavailable: qty <= 0
    };
    availabilityCache.set(product, state);
    return state;
  }

  function matchesAvailability(product, values) {
    if (!values.length) return true;
    const state = availabilityState(product);
    return (values.includes('available') && state.available) ||
           (values.includes('unavailable') && state.unavailable) ||
           (values.includes('low') && state.low);
  }

  function selected(className) {
    return Array.from(document.querySelectorAll('.' + className + ':checked')).map(c => c.value);
  }

  function installWhenReady() {
    if (typeof window.renderInventoryTable !== 'function') return false;

    /* Main renderer calls this directly; replacing the global binding makes
       every product search use the WeakMap cache instead of normalizing the
       same product name on every render. */
    window.productMatchesSearch = productSearchMatch;
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

    /* One pass for all three filter groups. Each group's count excludes
       only that same group, exactly like the original implementation. */
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
        if (wantedTerm && !productSearchMatch(p, wantedTerm)) continue;

        const shapeOK = !filters.shape.length || filters.shape.includes(p.shape);
        const typeOK = !filters.type.length || filters.type.includes(p.drug_type);
        const classValue = p.classification || '__unclassified__';
        const classOK = !filters.class.length || filters.class.includes(p.classification) ||
          (!p.classification && filters.class.includes('__unclassified__'));
        const availOK = matchesAvailability(p, filters.avail);

        if (typeOK && classOK && availOK) {
          const key = p.shape || '__unclassified__';
          shapeCounts.set(key, (shapeCounts.get(key) || 0) + 1);
        }
        if (shapeOK && classOK && availOK) {
          const key = p.drug_type || '__unclassified__';
          typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
        }
        if (shapeOK && typeOK && availOK) {
          classCounts.set(classValue, (classCounts.get(classValue) || 0) + 1);
        }
      }

      const write = (className, map) => document.querySelectorAll('.' + className).forEach(chk => {
        const span = chk.parentElement?.querySelector('.filter-option-count');
        if (span) span.textContent = '(' + (map.get(chk.value) || 0) + ')';
      });
      write('shapeChk', shapeCounts);
      write('typeChk', typeCounts);
      write('classChk', classCounts);
    };

    /* Cache inventory availability for the current product objects. The
       cache naturally resets when loadInventory replaces _productsCache. */
    window.getAvailabilityState = availabilityState;

    return true;
  }

  const timer = setInterval(() => {
    try {
      if (installWhenReady()) clearInterval(timer);
    } catch (e) {
      console.error('Farma inventory core performance:', e);
    }
  }, 25);
  setTimeout(() => clearInterval(timer), 15000);
})();
