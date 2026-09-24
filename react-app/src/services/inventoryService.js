import { supabase } from '../lib/supabase'

export async function loadInventoryPage({ page = 0, pageSize = 200, search = '' } = {}) {
  let productsQuery = supabase
    .from('products')
    .select('id,name,expiry_date,min_stock_threshold,default_sale_price', { count: 'exact' })
    .order('name')
    .range(page * pageSize, (page + 1) * pageSize - 1)

  if (search.trim()) productsQuery = productsQuery.ilike('name', `%${search.trim()}%`)

  const [{ data: products, count, error: productsError }, { data: inventory, error: inventoryError }] = await Promise.all([
    productsQuery,
    supabase.from('inventory').select('product_id,quantity_smallest_unit').limit(500),
  ])
  if (productsError) throw productsError
  if (inventoryError) throw inventoryError
  return { products: products || [], inventory: inventory || [], total: count || 0 }
}
