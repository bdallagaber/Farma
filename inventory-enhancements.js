/* ============================================================
   Farma - Inventory UX enhancements
   - Alphabetical sorting
   - "غير مصنف" filters for existing categorical filters
   - Extra filters for supplier / active ingredient / concentration
   - Live product count
============================================================ */
(function () {
  'use strict';

  if (!/(^|\/)inventory\.html$/i.test(window.location.pathname)) return;

  const UNCLASSIFIED = '__unclassified__';
  const extraState = {
    supplier: [],
    ingredient: [],
    concentration: []
  };

  let initialized = false;
  let rendering = false;

  function esc(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  function unique(values) {
    return Array.from(new Set((values || [])
      .filter(v => !isBlank(v))
      .map(v => String(v).trim())))
      .sort((a, b) => new Intl.Collator('ar', { sensitivity: 'base', numeric: true }).compare(a, b));
  }

  function selected(className) {
    return Array.from(document.querySelectorAll('.' + className + ':checked')).map(c => c.value);
  }

  function matchesExtra(product, field, values) {
    if (!values.length) return true;
    const raw = product[field];
    const isMissing = isBlank(raw);
    return values.some(v => v === UNCLASSIFIED ? isMissing : String(raw || '').trim() === v);
  }

  function getExtraFilteredProducts() {
    const cache = window._productsCache || [];
    return cache.filter(p =>
      matchesExtra(p, 'supplier', extraState.supplier) &&
      matchesExtra(p, 'active_ingredient', extraState.ingredient) &&
      matchesExtra(p, 'concentration', extraState.concentration)
    );
  }

  function withTemporaryUnclassifiedMarkers(products, callback) {
    const touched = [];
    const fields = ['shape', 'drug_type'];

    products.forEach(p => {
      fields.forEach(field => {
        if (isBlank(p[field])) {
          touched.push([p, field, p[field]]);
          p[field] = UNCLASSIFIED;
        }
      });
    });

    try {
      return callback();
    } finally {
      touched.forEach(([p, field, value]) => { p[field] = value; });
    }
  }

  function updateHeaderCount(visibleCount, totalCount) {
    const title = document.querySelector('.card h2');
    const stockTitle = Array.from(document.querySelectorAll('.card h2')).find(h =>
      (h.textContent || '').includes('المخزون الحالي')
    );
    const host = stockTitle ? stockTitle.parentElement : null;
    if (!host) return;

    let box = document.getElementById('inventoryCountSummary');
    if (!box) {
      box = document.createElement('div');
      box.id = 'inventoryCountSummary';
      box.style.cssText = 'margin:0 0 12px;padding:10px 14px;border:1px solid #dfe7e3;border-radius:10px;background:#f7faf8;font-size:13px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;';
      stockTitle.insertAdjacentElement('afterend', box);
    }

    const table = document.querySelector('#tableWrap table');
    const actualVisible = table ? table.querySelectorAll('tbody tr').length : visibleCount;

    box.innerHTML =
      '<span><strong>إجمالي المنتجات:</strong> ' + totalCount + '</span>' +
      '<span><strong>المعروض حاليًا:</strong> ' + actualVisible + '</span>';
  }

  function getCurrentVisibleBase(searchText) {
    const term = (searchText || '').trim();
    const source = getExtraFilteredProducts();

    return source.filter(p => {
      if (term && typeof window.fuzzyIncludes === 'function' &&
          !window.fuzzyIncludes((p.name || '') + ' ' + (p.name_en || ''), term)) return false;

      const shape = selected('shapeChk');
      const type = selected('typeChk');
      const cls = selected('classChk');
      const avail = selected('availChk');

      const shapeOk = !shape.length || shape.includes(isBlank(p.shape) ? UNCLASSIFIED : p.shape);
      const typeOk = !type.length || type.includes(isBlank(p.drug_type) ? UNCLASSIFIED : p.drug_type);

      const classOk = !cls.length || cls.includes(isBlank(p.classification) ? UNCLASSIFIED : p.classification);

      let availOk = true;
      if (avail.length && typeof window.getAvailabilityState === 'function') {
        const state = window.getAvailabilityState(p);
        availOk = (avail.includes('available') && state.available) ||
                  (avail.includes('unavailable') && state.unavailable) ||
                  (avail.includes('low') && state.low);
      }

      return shapeOk && typeOk && classOk && availOk;
    });
  }

  function rerender() {
    if (rendering || typeof window.renderInventoryTable !== 'function') return;
    rendering = true;

    const search = document.getElementById('searchBox')?.value || '';
    const originalCache = window._productsCache || [];
    const filteredCache = getExtraFilteredProducts();

    try {
      window._productsCache = filteredCache;
      withTemporaryUnclassifiedMarkers(filteredCache, () => {
        window.renderInventoryTable(search);
      });
    } finally {
      window._productsCache = originalCache;
      rendering = false;
    }

    updateAllFilterCounts();
    updateHeaderCount(getCurrentVisibleBase(search).length, originalCache.length);
  }

  function appendUnclassified(boxId, groupClass, labelText) {
    const box = document.getElementById(boxId);
    if (!box || box.querySelector('[data-unclassified="1"]')) return;

    const label = document.createElement('label');
    label.setAttribute('data-unclassified', '1');
    label.innerHTML =
      '<input type="checkbox" class="' + groupClass + '" value="' + UNCLASSIFIED + '"> ' +
      esc(labelText) +
      ' <span class="filter-option-count" data-filter-group="' + groupClass + '" data-filter-value="' + UNCLASSIFIED + '">0</span>';
    box.appendChild(label);
  }

  function updateAllFilterCounts() {
    ['shapeChk', 'typeChk', 'classChk', 'availChk'].forEach((cls, i) => {
      const ids = ['filterShapeCount', 'filterTypeCount', 'filterClassCount', 'filterAvailabilityCount'];
      if (typeof window.updateFilterCount === 'function') {
        window.updateFilterCount(cls, ids[i]);
      }
    });
  }

  function buildExtraFilter(boxId, summaryId, groupClass, field, title) {
    const box = document.getElementById(boxId);
    if (!box) return;

    const source = window._productsCache || [];
    const values = unique(source.map(p => p[field]));
    box.innerHTML = '';

    const all = [UNCLASSIFIED, ...values];
    all.forEach(value => {
      const label = document.createElement('label');
      label.innerHTML =
        '<input type="checkbox" class="' + groupClass + '" value="' + esc(value) + '"> ' +
        '<span>' + esc(value === UNCLASSIFIED ? 'غير مصنف' : value) + '</span> ' +
        '<span class="filter-option-count" data-filter-group="' + groupClass + '" data-filter-value="' + esc(value) + '">(0)</span>';
      box.appendChild(label);
    });

    box.querySelectorAll('input').forEach(chk => {
      chk.addEventListener('change', () => {
        extraState[field === 'active_ingredient' ? 'ingredient' : field] = selected(groupClass);
        const n = selected(groupClass).length;
        const summary = document.getElementById(summaryId);
        if (summary) summary.textContent = n ? '(' + n + ')' : '';
        rerender();
      });
    });

    const details = box.closest('details');
    if (details) {
      details.querySelector('summary').firstChild.textContent = title + ' ';
    }
  }

  function addExtraFilterDetails() {
    const toolbar = document.querySelector('.inventory-toolbar');
    if (!toolbar || document.getElementById('filterIngredientPanel')) return;

    const definitions = [
      ['filterSupplierPanel', 'filterSupplierBox', 'filterSupplierCount', 'supplierChk', 'supplier', 'المورد'],
      ['filterIngredientPanel', 'filterIngredientBox', 'filterIngredientCount', 'ingredientChk', 'active_ingredient', 'المادة الفعالة'],
      ['filterConcentrationPanel', 'filterConcentrationBox', 'filterConcentrationCount', 'concentrationChk', 'concentration', 'التركيز']
    ];

    const exportBtn = document.getElementById('exportBtn');
    definitions.forEach(([panelId, boxId, countId, cls, field, title]) => {
      const details = document.createElement('details');
      details.className = 'filter-panel';
      details.id = panelId;
      details.innerHTML = '<summary>' + title + ' <span id="' + countId + '"></span></summary><div id="' + boxId + '" class="filter-checks"></div>';
      toolbar.insertBefore(details, exportBtn || null);
    });
  }

  function addSortControl() {
    const toolbar = document.querySelector('.inventory-toolbar');
    if (!toolbar || document.getElementById('inventorySort')) return;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:190px;';
    wrap.innerHTML =
      '<label for="inventorySort" style="margin:0;white-space:nowrap;font-size:13px;">ترتيب:</label>' +
      '<select id="inventorySort" style="margin:0;min-width:155px;">' +
        '<option value="ar_asc">الاسم العربي: أ → ي</option>' +
        '<option value="ar_desc">الاسم العربي: ي → أ</option>' +
        '<option value="en_asc">الاسم الإنجليزي: A → Z</option>' +
        '<option value="en_desc">الاسم الإنجليزي: Z → A</option>' +
      '</select>';

    const search = document.getElementById('searchBox');
    if (search) search.insertAdjacentElement('afterend', wrap);
    else toolbar.prepend(wrap);

    const saved = localStorage.getItem('farmaInventorySort');
    wrap.querySelector('select').value = saved || 'ar_asc';
    wrap.querySelector('select').addEventListener('change', e => {
      localStorage.setItem('farmaInventorySort', e.target.value);
      rerender();
    });
  }

  function addUnclassifiedOptions() {
    appendUnclassified('filterShapeBox', 'shapeChk', 'غير مصنف');
    appendUnclassified('filterTypeBox', 'typeChk', 'غير مصنف');
    appendUnclassified('filterClassBox', 'classChk', 'غير مصنف');
  }

  function installFilterInterception() {
    if (document.documentElement.dataset.farmaInventoryFilterInterceptor === '1') return;
    document.documentElement.dataset.farmaInventoryFilterInterceptor = '1';

    document.addEventListener('change', e => {
      const target = e.target;
      if (!target || target.type !== 'checkbox') return;
      const filterClasses = ['shapeChk', 'typeChk', 'classChk', 'availChk'];
      if (!filterClasses.includes(target.className)) return;

      e.stopImmediatePropagation();
      updateAllFilterCounts();
      rerender();
    }, true);
  }

  function observeFilterRebuilds() {
    ['filterShapeBox', 'filterTypeBox', 'filterClassBox'].forEach(id => {
      const box = document.getElementById(id);
      if (!box || box.dataset.farmaObserved === '1') return;
      box.dataset.farmaObserved = '1';
      new MutationObserver(() => {
        addUnclassifiedOptions();
      }).observe(box, { childList: true });
    });
  }

  function updateExtraCounts() {
    const products = getCurrentVisibleBase(document.getElementById('searchBox')?.value || '');
    const definitions = [
      ['supplierChk', 'supplier', 'filterSupplierBox'],
      ['ingredientChk', 'active_ingredient', 'filterIngredientBox'],
      ['concentrationChk', 'concentration', 'filterConcentrationBox']
    ];

    definitions.forEach(([cls, field, boxId]) => {
      document.querySelectorAll('#' + boxId + ' .filter-option-count').forEach(span => {
        const value = span.dataset.filterValue;
        const count = products.filter(p => value === UNCLASSIFIED ? isBlank(p[field]) : String(p[field] || '').trim() === value).length;
        span.textContent = '(' + count + ')';
      });
    });
  }

  function boot() {
    if (initialized) return;
    if (typeof window.renderInventoryTable !== 'function') return;
    if (!document.getElementById('filterShapeBox')) return;

    initialized = true;

    addSortControl();
    addExtraFilterDetails();
    addUnclassifiedOptions();
    observeFilterRebuilds();
    installFilterInterception();

    buildExtraFilter('filterSupplierBox', 'filterSupplierCount', 'supplierChk', 'supplier', 'المورد');
    buildExtraFilter('filterIngredientBox', 'filterIngredientCount', 'ingredientChk', 'active_ingredient', 'المادة الفعالة');
    buildExtraFilter('filterConcentrationBox', 'filterConcentrationCount', 'concentrationChk', 'concentration', 'التركيز');

    const search = document.getElementById('searchBox');
    if (search) {
      search.addEventListener('input', () => {
        setTimeout(() => {
          rerender();
          updateExtraCounts();
        }, 0);
      }, true);
    }

    const tableWrap = document.getElementById('tableWrap');
    if (tableWrap) {
      new MutationObserver(() => {
        if (!rendering) {
          updateHeaderCount(getCurrentVisibleBase(search?.value || '').length, (window._productsCache || []).length);
          updateExtraCounts();
        }
      }).observe(tableWrap, { childList: true, subtree: true });
    }

    setTimeout(() => {
      addUnclassifiedOptions();
      rerender();
      updateExtraCounts();
    }, 50);
  }

  const timer = setInterval(() => {
    try {
      if (window._productsCache && typeof window.renderInventoryTable === 'function') {
        boot();
        if (initialized) clearInterval(timer);
      }
    } catch (err) {
      console.error('Farma inventory enhancements:', err);
    }
  }, 50);

  setTimeout(() => clearInterval(timer), 15000);
})();
