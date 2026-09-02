/* Farma inventory recovery layer
   Keeps inventory visible even if the nested Supabase relation query fails. */
(function () {
  'use strict';

  if (!/(^|\/)inventory\.html$/i.test(window.location.pathname)) return;

  async function recoverInventory() {
    if (typeof window.renderInventoryTable !== 'function') return;

    const cache = window._productsCache || [];
    const table = document.querySelector('#tableWrap table');
    if (cache.length && table && table.querySelectorAll('tbody tr').length) return;

    try {
      const { data: products, error: productError } = await sb
        .from('products')
        .select('id, name, name_en, shape, drug_type, classification, supplier, active_ingredient, concentration, retail_allowed, sale_allowed_units, qr_code, barcode, unit_large, unit_large_to_medium, unit_medium, unit_medium_to_small, unit_small, expiry_date, min_stock_threshold, other_note, default_sale_price')
        .order('created_at', { ascending: false });

      if (productError) {
        console.error('Inventory recovery products query failed:', productError);
        return;
      }

      const { data: inventoryRows, error: inventoryError } = await sb
        .from('inventory')
        .select('product_id, quantity_smallest_unit');

      if (inventoryError) {
        console.warn('Inventory recovery stock query failed:', inventoryError);
      }

      const inventoryMap = new Map();
      (inventoryRows || []).forEach(row => {
        inventoryMap.set(row.product_id, [{ quantity_smallest_unit: row.quantity_smallest_unit }]);
      });

      window._productsCache = (products || []).map(product => ({
        ...product,
        inventory: inventoryMap.get(product.id) || []
      }));

      if (typeof populateFilterDropdowns === 'function') populateFilterDropdowns();
      renderInventoryTable(document.getElementById('searchBox')?.value || '');

      if (typeof window.refreshExtraFiltersIfNeeded === 'function') {
        window.refreshExtraFiltersIfNeeded();
      }
    } catch (err) {
      console.error('Inventory recovery exception:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(recoverInventory, 1800);
  });
})();
