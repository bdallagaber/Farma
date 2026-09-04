/* ============================================================
   Farma - Online product lookup
   Source: DwaPrices API via Supabase Edge Function
   Flow: barcode / Arabic name / English name -> DwaPrices -> autofill -> user review -> save
============================================================ */
(function () {
  'use strict';

  if (!/(^|\/)inventory\.html$/i.test(window.location.pathname)) return;

  const FUNCTION_NAME = 'lookup-drug-barcode';
  let lookupTimer = null;
  let lastQuery = '';
  let requestInFlight = false;

  function get(id) { return document.getElementById(id); }

  function cleanQuery(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function isEditing() {
    try { return Boolean(editingProductId); } catch (_) { return false; }
  }

  function ensureStatus() {
    let el = get('barcodeLookupStatus');
    if (el) return el;
    const anchor = get('p_name') || get('p_qr');
    if (!anchor || !anchor.parentElement) return null;
    el = document.createElement('div');
    el.id = 'barcodeLookupStatus';
    el.style.cssText = 'margin-top:8px;padding:9px 12px;border-radius:8px;font-size:12px;display:none;line-height:1.6;';
    anchor.parentElement.appendChild(el);
    return el;
  }

  function setStatus(text, type) {
    const el = ensureStatus();
    if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
    el.style.background = type === 'error' ? '#fff1f0' : type === 'ok' ? '#edf9f1' : '#f4f7f6';
    el.style.border = type === 'error' ? '1px solid #f1b7b2' : type === 'ok' ? '1px solid #b9dfc5' : '1px solid #dfe7e3';
    el.style.color = type === 'error' ? '#b42318' : type === 'ok' ? '#18794e' : '#52615a';
  }

  function setSelectValue(id, value, addIfMissing) {
    const select = get(id);
    if (!select || value == null || String(value).trim() === '') return false;
    const wanted = String(value).trim();
    let option = Array.from(select.options).find(o => String(o.value).trim() === wanted);
    if (!option && addIfMissing) {
      option = document.createElement('option');
      option.value = wanted;
      option.textContent = wanted;
      select.appendChild(option);
    }
    if (!option) return false;
    select.value = wanted;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setInput(id, value) {
    const input = get(id);
    if (!input || value == null || String(value).trim() === '') return false;
    input.value = String(value).trim();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function parsePrice(value) {
    if (value == null || value === '') return '';
    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) ? String(n) : '';
  }

  function normalizeDosageForm(value) {
    const s = String(value || '').trim().toLowerCase();
    const map = {
      tablet: 'قرص', tablets: 'قرص', tab: 'قرص', tabs: 'قرص',
      capsule: 'كبسول', capsules: 'كبسول', cap: 'كبسول', caps: 'كبسول',
      syrup: 'شراب', solution: 'محلول', suspension: 'معلق',
      cream: 'كريم', ointment: 'مرهم', gel: 'جل', lotion: 'لوشن',
      drops: 'قطرة', drop: 'قطرة', eye_drop: 'قطرة', ear_drop: 'قطرة',
      suppository: 'لبوس', suppositories: 'لبوس',
      ampoule: 'أمبول', ampoules: 'أمبول', injection: 'حقن', injections: 'حقن',
      vial: 'فيال', vials: 'فيال', sachet: 'كيس', sachets: 'كيس',
      powder: 'بودرة', spray: 'بخاخ', inhaler: 'بخاخ', shampoo: 'شامبو',
      cream_gel: 'كريم', oral_drops: 'قطرة'
    };
    return map[s] || String(value || '').trim();
  }

  function applyProduct(data) {
    const name = data.name || '';
    const nameEn = data.name_en || '';
    const active = data.active_ingredient || '';
    const concentration = data.concentration || '';
    const price = parsePrice(data.default_sale_price);
    const shape = normalizeDosageForm(data.shape || '');
    const classification = data.classification || '';
    const drugType = data.drug_type || '';
    const company = data.manufacturer || '';

    if (name) setInput('p_name', name);
    if (nameEn) setInput('p_name_en', nameEn);
    if (active) setInput('p_active_ingredient', active);
    if (concentration) setInput('p_concentration', concentration);
    if (price) setInput('p_box_price', price);
    if (data.barcode) setInput('p_qr', data.barcode);
    if (drugType) setSelectValue('p_drug_type', drugType, true);

    if (shape) {
      const shapeSelect = get('p_shape');
      const existingShape = shapeSelect && Array.from(shapeSelect.options).find(o =>
        String(o.value).trim().toLowerCase() === shape.toLowerCase() ||
        String(o.textContent).trim().toLowerCase() === shape.toLowerCase()
      );
      if (existingShape) {
        shapeSelect.value = existingShape.value;
        shapeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (shapeSelect) {
        const option = document.createElement('option');
        option.value = shape;
        option.textContent = shape;
        shapeSelect.appendChild(option);
        shapeSelect.value = shape;
        if (typeof updateShapeFields === 'function') updateShapeFields(true);
      }
    }

    if (classification) setSelectValue('p_classification', classification, true);
    if (company) setSelectValue('p_supplier', company, false);

    const priceNote = price ? ' السعر المقترح: ' + price + ' ج.' : '';
    setStatus('تم العثور على المنتج من DwaPrices وتم ملء البيانات تلقائيًا. راجع البيانات قبل الحفظ.' + priceNote, 'ok');
  }

  async function lookup(query, mode) {
    if (!query || requestInFlight || isEditing()) return;
    requestInFlight = true;
    setStatus('🔎 جاري البحث عن الدواء على الإنترنت...', 'info');
    try {
      const { data, error } = await sb.functions.invoke(FUNCTION_NAME, { body: { query } });
      if (error) throw error;

      if (!data || data.found !== true || !data.data) {
        if (data?.multiple) {
          setStatus('تم العثور على أكثر من منتج بهذا الاسم. اكتب الاسم كاملًا، ويفضل إضافة التركيز مثل 500 mg، لتحديد المنتج الصحيح.', 'error');
        } else {
          setStatus('لم يتم العثور على المنتج في DwaPrices. يمكنك إدخال البيانات يدويًا.', 'error');
        }
        return;
      }
      applyProduct(data.data);
    } catch (err) {
      console.error('DwaPrices product lookup failed:', err);
      setStatus('تعذّر البحث عن بيانات المنتج الآن. يمكنك إكمال الإضافة يدويًا.', 'error');
    } finally {
      requestInFlight = false;
    }
  }

  function scheduleLookup(input, mode) {
    if (!input || isEditing()) return;
    const query = cleanQuery(input.value);
    const minimum = mode === 'barcode' ? 6 : 3;
    if (!query || query.length < minimum || query === lastQuery) return;
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(() => {
      const latest = cleanQuery(input.value);
      if (!latest || latest !== query || latest.length < minimum || isEditing()) return;
      lastQuery = latest;
      lookup(latest, mode);
    }, mode === 'barcode' ? 450 : 800);
  }

  function watchInput(id, mode) {
    const input = get(id);
    if (!input || input.dataset.farmaOnlineLookup === '1') return;
    input.dataset.farmaOnlineLookup = '1';
    input.addEventListener('input', () => scheduleLookup(input, mode));
    input.addEventListener('change', () => scheduleLookup(input, mode));
    input.addEventListener('blur', () => scheduleLookup(input, mode));
    return input;
  }

  function watchScannerChanges() {
    const input = get('p_qr');
    if (!input) return;
    setInterval(() => {
      if (isEditing()) return;
      const value = cleanQuery(input.value);
      if (value && value.length >= 6 && value !== lastQuery) scheduleLookup(input, 'barcode');
      if (!value && lastQuery && /^\d+$/.test(lastQuery)) lastQuery = '';
    }, 500);
  }

  function addHints() {
    const qr = get('p_qr');
    const name = get('p_name');
    const nameEn = get('p_name_en');
    if (qr) {
      qr.setAttribute('autocomplete', 'off');
      qr.setAttribute('inputmode', 'numeric');
      qr.placeholder = 'الباركود أو امسحه بالكاميرا';
    }
    if (name) name.placeholder = name.placeholder || 'اكتب الاسم العربي للبحث أونلاين';
    if (nameEn) nameEn.placeholder = nameEn.placeholder || 'اكتب الاسم الإنجليزي للبحث أونلاين';
    ensureStatus();
  }

  function boot() {
    if (typeof sb === 'undefined') return false;
    if (document.documentElement.dataset.farmaOnlineDrugLookup === '1') return true;
    const qr = get('p_qr');
    const name = get('p_name');
    const nameEn = get('p_name_en');
    if (!qr && !name && !nameEn) return false;
    document.documentElement.dataset.farmaOnlineDrugLookup = '1';
    addHints();
    watchInput('p_qr', 'barcode');
    watchInput('p_name', 'name');
    watchInput('p_name_en', 'name');
    watchScannerChanges();
    return true;
  }

  if (!boot()) {
    const observer = new MutationObserver(() => {
      if (boot()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }
})();
