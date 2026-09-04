/* ============================================================
   Farma - Online barcode product lookup
   Source: DwaPrices API via Supabase Edge Function
   Flow: barcode -> DwaPrices -> autofill form -> user review -> save
============================================================ */
(function () {
  'use strict';

  if (!/(^|\/)inventory\.html$/i.test(window.location.pathname)) return;

  const FUNCTION_NAME = 'lookup-drug-barcode';
  let lookupTimer = null;
  let lastBarcode = '';
  let requestInFlight = false;

  function get(id) {
    return document.getElementById(id);
  }

  function cleanBarcode(value) {
    return String(value || '').trim().replace(/\s+/g, '');
  }

  function isEditing() {
    try { return Boolean(editingProductId); } catch (_) { return false; }
  }

  function ensureStatus() {
    let el = get('barcodeLookupStatus');
    if (el) return el;

    const input = get('p_qr');
    if (!input || !input.parentElement || !input.parentElement.parentElement) return null;

    el = document.createElement('div');
    el.id = 'barcodeLookupStatus';
    el.style.cssText = 'margin-top:8px;padding:9px 12px;border-radius:8px;font-size:12px;display:none;line-height:1.6;';
    input.parentElement.parentElement.appendChild(el);
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

  function applyProduct(data) {
    const name = data.name || '';
    const nameEn = data.name_en || '';
    const active = data.active_ingredient || '';
    const concentration = data.concentration || '';
    const price = parsePrice(data.default_sale_price);
    const shape = data.shape || '';
    const classification = data.classification || '';
    const company = data.manufacturer || '';

    if (name) setInput('p_name', name);
    if (nameEn) setInput('p_name_en', nameEn);
    if (active) setInput('p_active_ingredient', active);
    if (concentration) setInput('p_concentration', concentration);
    if (price) setInput('p_box_price', price);

    // Keep the current inventory-specific unit logic intact.
    // We only prefill the closest matching type/shape/classification.
    if (data.drug_type) setSelectValue('p_drug_type', data.drug_type, true);

    if (shape) {
      const shapeSelect = get('p_shape');
      const existingShape = shapeSelect && Array.from(shapeSelect.options).find(o =>
        String(o.value).trim().toLowerCase() === String(shape).trim().toLowerCase() ||
        String(o.textContent).trim().toLowerCase() === String(shape).trim().toLowerCase()
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
        // Do not dispatch change here: it could overwrite the just-added option.
        if (typeof updateShapeFields === 'function') updateShapeFields(true);
      }
    }

    if (classification) setSelectValue('p_classification', classification, true);

    // The product's manufacturer is useful, but the form calls this field "المورد".
    // Only prefill it when it already exists; don't silently turn a manufacturer into a supplier.
    if (company) setSelectValue('p_supplier', company, false);

    const priceNote = price ? ' السعر المقترح: ' + price + ' ج.' : '';
    setStatus('تم العثور على المنتج من DwaPrices وتم ملء البيانات تلقائيًا. راجع البيانات قبل الحفظ.' + priceNote, 'ok');
  }

  async function lookupBarcode(barcode) {
    if (!barcode || requestInFlight || isEditing()) return;
    requestInFlight = true;
    setStatus('🔎 جاري البحث عن الباركود على الإنترنت...', 'info');

    try {
      const { data, error } = await sb.functions.invoke(FUNCTION_NAME, {
        body: { barcode }
      });

      if (error) throw error;

      if (!data || data.found !== true || !data.data) {
        setStatus('لم يتم العثور على المنتج بهذا الباركود في DwaPrices. يمكنك إدخال البيانات يدويًا.', 'error');
        return;
      }

      applyProduct(data.data);
    } catch (err) {
      console.error('DwaPrices barcode lookup failed:', err);
      setStatus('تعذّر البحث عن بيانات المنتج الآن. يمكنك إكمال الإضافة يدويًا.', 'error');
    } finally {
      requestInFlight = false;
    }
  }

  function scheduleLookup() {
    const input = get('p_qr');
    if (!input || isEditing()) return;
    const barcode = cleanBarcode(input.value);
    if (!barcode || barcode === lastBarcode) return;

    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(() => {
      const latest = cleanBarcode(input.value);
      if (!latest || latest !== barcode || isEditing()) return;
      lastBarcode = latest;
      lookupBarcode(latest);
    }, 450);
  }

  function watchScannerChanges() {
    const input = get('p_qr');
    if (!input) return;

    input.addEventListener('input', scheduleLookup);
    input.addEventListener('change', scheduleLookup);
    input.addEventListener('blur', scheduleLookup);

    // The existing camera scanner writes directly to .value, so there is no input event.
    // Poll only this single field; it is cheap and catches camera scans reliably.
    setInterval(() => {
      if (isEditing()) return;
      const value = cleanBarcode(input.value);
      if (value && value !== lastBarcode && value.length >= 6) {
        scheduleLookup();
      }
      if (!value) lastBarcode = '';
    }, 500);
  }

  function addHint() {
    const input = get('p_qr');
    if (!input) return;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('inputmode', 'numeric');
    input.placeholder = 'اكتب الباركود وسيتم البحث أونلاين تلقائيًا';
    ensureStatus();
  }

  function boot() {
    if (!get('p_qr') || typeof sb === 'undefined') return false;
    if (document.documentElement.dataset.farmaBarcodeLookup === '1') return true;
    document.documentElement.dataset.farmaBarcodeLookup = '1';
    addHint();
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
