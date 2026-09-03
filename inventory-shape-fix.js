/* Farma - enforce dosage shapes by product type */
(function () {
  'use strict';

  if (!/(^|\/)inventory\.html$/i.test(window.location.pathname)) return;

  const TYPE_DRUGS = 'ادوية';
  const AMP_EN = 'Ampoule';
  const AMP_AR = ['أمبول', 'امبول'];

  function typeSelect() { return document.getElementById('p_drug_type'); }
  function shapeSelect() { return document.getElementById('p_shape'); }

  function normalize(v) {
    return String(v == null ? '' : v).trim();
  }

  function enforce() {
    const type = typeSelect();
    const shape = shapeSelect();
    if (!type || !shape) return;

    const isDrugs = normalize(type.value) === TYPE_DRUGS;

    Array.from(shape.options).forEach(option => {
      const text = normalize(option.textContent);
      const value = normalize(option.value);
      const isAmpoule = value.toLowerCase() === AMP_EN.toLowerCase() || AMP_AR.includes(text);

      // The Arabic built-in "أمبول" was never a registered custom option.
      // For drugs, keep only the registered English Ampoule from custom_options.
      if (isAmpoule && (text !== AMP_EN || value.toLowerCase() !== AMP_EN.toLowerCase())) {
        option.remove();
      }
    });

    if (!isDrugs) {
      // "اخرى" has no dosage shapes at all. Clear any stale/default shape.
      shape.innerHTML = '<option value="">-- بدون --</option>';
      shape.value = '';
      return;
    }

    // Never invent Ampoule here. It must come from custom_options.
    // This also prevents the enhancement script from creating an Arabic fake option.
  }

  function boot() {
    enforce();

    const type = typeSelect();
    const shape = shapeSelect();
    if (!type || !shape) return;

    type.addEventListener('change', () => setTimeout(enforce, 0), true);
    new MutationObserver(() => enforce()).observe(shape, { childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
