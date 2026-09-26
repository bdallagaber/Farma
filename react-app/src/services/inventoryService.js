import { supabase } from '../lib/supabase'

export async function loadInventoryPage({ page = 0, pageSize = 200, search = '', filters = {} } = {}) {
  let productsQuery = supabase
    .from('products')
    .select('id,name,name_en,drug_type,shape,classification,supplier,active_ingredient,concentration,expiry_date,min_stock_threshold,default_sale_price,unit_large,unit_large_to_medium,unit_medium_to_small,unit_medium,unit_small,qr_code,created_at')
    .limit(5000)
  const text = search.trim()
  if (text) productsQuery = productsQuery.or(`name.ilike.%${text}%,qr_code.ilike.%${text}%,active_ingredient.ilike.%${text}%,concentration.ilike.%${text}%`)
  const equals = [['drug_type', filters.type], ['shape', filters.shape], ['classification', filters.classification], ['supplier', filters.supplier], ['active_ingredient', filters.activeIngredient], ['concentration', filters.concentration]]
  for (const [column, value] of equals) {
    if (!value || value === 'all') continue
    productsQuery = value === 'uncategorized' ? productsQuery.is(column, null) : productsQuery.eq(column, value)
  }
  if (filters.price === 'uncategorized') productsQuery = productsQuery.is('default_sale_price', null)
  if (filters.price === 'with-price') productsQuery = productsQuery.not('default_sale_price', 'is', null)
  const [{ data: rawProducts, error: productsError }, { data: inventory, error: inventoryError }, { data: costs, error: costsError }] = await Promise.all([
    productsQuery,
    supabase.from('inventory').select('product_id,quantity_smallest_unit').limit(5000),
    supabase.from('product_costs').select('product_id,purchase_price,updated_at').limit(5000),
  ])
  if (productsError) throw productsError
  if (inventoryError) throw inventoryError
  if (costsError) throw costsError
  const quantities = Object.fromEntries((inventory || []).map(row => [row.product_id, Number(row.quantity_smallest_unit || 0)]))
  const costMap = Object.fromEntries((costs || []).map(row => [row.product_id, row]))
  const today = new Date(); const expirySoon = new Date(today); expirySoon.setMonth(expirySoon.getMonth() + 5)
  const filtered = (rawProducts || []).map(product => ({ ...product, purchase_price: costMap[product.id]?.purchase_price ?? null, purchase_price_updated_at: costMap[product.id]?.updated_at ?? null })).filter(product => {
    const quantity = quantities[product.id] || 0; const threshold = Number(product.min_stock_threshold || 0); const expiry = product.expiry_date ? new Date(product.expiry_date) : null
    const stockOk = filters.stock === 'all' || (filters.stock === 'available' && quantity > threshold) || (filters.stock === 'low' && quantity > 0 && quantity <= threshold) || (filters.stock === 'out' && quantity <= 0) || (filters.stock === 'uncategorized' && product.min_stock_threshold == null)
    const expiryOk = filters.expiry === 'all' || (filters.expiry === 'has-date' && Boolean(product.expiry_date)) || (filters.expiry === 'expired' && expiry && expiry < today) || (filters.expiry === 'none' && !expiry) || (filters.expiry === 'uncategorized' && !product.expiry_date)
    const unitOk = filters.unit === 'all' || (filters.unit === 'uncategorized' && !product.unit_medium) || product.unit_medium === filters.unit
    return stockOk && expiryOk && unitOk
  }).sort((a, b) => { if (filters.sort === 'newest') return new Date(b.created_at || 0) - new Date(a.created_at || 0); const result = String(a.name || '').localeCompare(String(b.name || ''), 'ar'); return filters.sort === 'za' ? -result : result })
  return { products: filtered.slice(page * pageSize, (page + 1) * pageSize), inventory: inventory || [], total: filtered.length }
}
