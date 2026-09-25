import { supabase } from '../lib/supabase'

export async function loadInventoryPage({ page = 0, pageSize = 200, search = '', filters = {} } = {}) {
  let productsQuery = supabase
    .from('products')
    .select('id,name,name_en,drug_type,shape,classification,supplier,active_ingredient,concentration,expiry_date,min_stock_threshold,default_sale_price,unit_large,unit_large_to_medium,unit_medium_to_small,unit_medium,unit_small,qr_code,created_at', { count: 'exact' })
    .order(filters.sort === 'newest' ? 'created_at' : 'name', { ascending: filters.sort === 'az' || filters.sort === 'name', nullsFirst: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)

  const text = search.trim()
  if (text) productsQuery = productsQuery.or(`name.ilike.%${text}%,qr_code.ilike.%${text}%,active_ingredient.ilike.%${text}%,concentration.ilike.%${text}%`)
  const equals = [['drug_type', filters.type], ['shape', filters.shape], ['classification', filters.classification], ['supplier', filters.supplier], ['active_ingredient', filters.activeIngredient], ['concentration', filters.concentration]]
  for (const [column, value] of equals) {
    if (!value || value === 'all') continue
    productsQuery = value === 'uncategorized' ? productsQuery.is(column, null) : productsQuery.eq(column, value)
  }
  if (filters.price === 'uncategorized') productsQuery = productsQuery.is('default_sale_price', null)
  if (filters.price === 'with-price') productsQuery = productsQuery.not('default_sale_price', 'is', null)

  const [{ data: products, count, error: productsError }, { data: inventory, error: inventoryError }] = await Promise.all([
    productsQuery,
    supabase.from('inventory').select('product_id,quantity_smallest_unit').limit(5000),
  ])
  if (productsError) throw productsError
  if (inventoryError) throw inventoryError
  return { products: products || [], inventory: inventory || [], total: count || 0 }
}
