/* ============================================================
   Farma - Inventory render performance layer
   Keeps the original row markup. After the first full render,
   filtering/searching reuses the existing DOM instead of rebuilding
   the entire table on every keystroke/filter change.
   No pagination and no business-logic changes.
============================================================ */
(function () {
  'use strict';
  if (!/(^|\/)inventory\.html$/i.test(window.location.pathname)) return;

  let originalRender = null;
  let installed = false;
  let cacheRef = null;
  let rowById = new Map();
  let knownProducts = new Map();

  function selected(className) {
    return Array.from(document.querySelectorAll('.' + className + ':checked')).map(c => c.value);
  }

  function matchesSearch(product, term) {
    if (!term) return true;
    if (typeof window.productMatchesSearch === 'function') {
      return window.productMatchesSearch(product, term);
    }
    const hay = String((product.name || '') + ' ' + (product.name_en || '')).toLowerCase().replace(/\s+/g, '');
    const normalized = String(term).toLowerCase().replace(/\s+/g, '');
    return hay.includes(normalized);
  }

  function matchesFilters(product) {
    const shape = selected('shapeChk');
    const type = selected('typeChk');
    const cls = selected('classChk');
    const avail = selected('availChk');

    if (shape.length && !shape.includes(product.shape)) return false;
    if (type.length && !type.includes(product.drug_type)) return false;

    if (cls.length) {
      const unclassified = !product.classification;
      if (!cls.includes(product.classification) && !(unclassified && cls.includes('__unclassified__'))) return false;
    }

    if (avail.length && typeof window.getAvailabilityState === 'function') {
      const state = window.getAvailabilityState(product);
      const ok = (avail.includes('available') && state.available) ||
        (avail.includes('unavailable') && state.unavailable) ||
        (avail.includes('low') && state.low);
      if (!ok) return false;
    }

    return true;
  }

  function currentProducts(term) {
    const source = window._productsCache || [];
    return source.filter(p => matchesSearch(p, term) && matchesFilters(p));
  }

  function rebuildRowMap() {
    rowById = new Map();
    knownProducts = new Map();
    const products = window._productsCache || [];
    products.forEach(p => knownProducts.set(String(p.id), p));
    document.querySelectorAll('#tableWrap tbody tr').forEach(row => {
      const input = row.querySelector('input[id^="qedit_"]');
      if (!input) return;
      const id = input.id.slice(6);
      rowById.set(String(id), row);
    });
    cacheRef = products;
  }

  function captureExistingTable() {
    if (!document.querySelector('#tableWrap tbody')) return false;
    rebuildRowMap();
    return rowById.size > 0;
  }

  function applyFastRender(searchText) {
    const wrap = document.getElementById('tableWrap');
    if (!wrap) return;

    const source = window._productsCache || [];
    if (source !== cacheRef || rowById.size === 0) {
      originalRender(searchText);
      rebuildRowMap();
      return;
    }

    const term = String(searchText || '').trim();
    const visible = currentProducts(term);
    const visibleIds = new Set(visible.map(p => String(p.id)));

    rowById.forEach((row, id) => {
      row.style.display = visibleIds.has(id) ? '' : 'none';
    });

    if (typeof window.updateFilterOptionCounts === 'function') {
      window.updateFilterOptionCounts(term);
    }
  }

  function install() {
    if (installed || typeof window.renderInventoryTable !== 'function') return false;
    originalRender = window.renderInventoryTable;
    installed = true;

    window.renderInventoryTable = function (searchText) {
      const source = window._productsCache || [];

      if (source !== cacheRef) {
        originalRender(searchText);
        rebuildRowMap();
        return;
      }

      applyFastRender(searchText);
    };

    /* If the page already performed its first render before this layer loaded,
       capture that table without forcing another full DOM rebuild. */
    captureExistingTable();
    return true;
  }

  const timer = setInterval(() => {
    try {
      if (install()) clearInterval(timer);
    } catch (e) {
      console.error('Farma inventory render performance:', e);
    }
  }, 25);
  setTimeout(() => clearInterval(timer), 15000);
})();