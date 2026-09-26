import { supabase } from '../lib/supabase'

export async function loadShortages({ search = '', supplier = 'all', severity = 'all', expiry = 'all', sort = 'name' } = {}) {
  let query = supabase.from('products').select('id,name,expiry_date,min_stock_threshold,supplier,default_sale_price,unit_medium_to_small,created_at').order(sort === 'newest' ? 'created_at' : 'name', { ascending: sort !== 'za' && sort !== 'newest', nullsFirst: false }).limit(5000)
  if (search.trim()) query = query.or(`name.ilike.%${search.trim()}%,active_ingredient.ilike.%${search.trim()}%`)
  if (supplier !== 'all') query = supplier === 'uncategorized' ? query.is('supplier', null) : query.eq('supplier', supplier)
  const [{ data: products, error: productError }, { data: inventory, error: inventoryError }] = await Promise.all([query, supabase.from('inventory').select('product_id,quantity_smallest_unit').limit(5000)])
  if (productError) throw productError
  if (inventoryError) throw inventoryError
  const today = new Date(); const fiveMonths = new Date(today); fiveMonths.setMonth(fiveMonths.getMonth() + 5)
  const quantities = Object.fromEntries((inventory || []).map(row => [row.product_id, Number(row.quantity_smallest_unit || 0)]))
  const rows = (products || []).map(product => { const quantity = quantities[product.id] || 0; const threshold = Number(product.min_stock_threshold || 0); const expiryDate = product.expiry_date ? new Date(product.expiry_date) : null; return { ...product, quantity, threshold, expiryDate, isOut: quantity <= 0, isLow: quantity > 0 && quantity <= threshold, nearExpiry: expiryDate && expiryDate >= today && expiryDate <= fiveMonths, expired: expiryDate && expiryDate < today } }).filter(row => { const severityOk = severity === 'all' || (severity === 'out' && row.isOut) || (severity === 'low' && row.isLow) || (severity === 'uncategorized' && !row.threshold); const expiryOk = expiry === 'all' || (expiry === 'near' && row.nearExpiry) || (expiry === 'expired' && row.expired) || (expiry === 'uncategorized' && !row.expiry_date); return (row.isOut || row.isLow || row.nearExpiry || row.expired) && severityOk && expiryOk })
  return rows
}

export async function listPurchaseOrders() { const { data, error } = await supabase.from('purchase_orders').select('id,order_number,supplier_name,status,notes,created_at,received_at,cancelled_at,purchase_order_items(id,product_id,product_name_snapshot,boxes,quantity_smallest_unit)').order('created_at', { ascending: false }).limit(200); if (error) throw error; return data || [] }
export async function createPurchaseOrder({ supplierName, items, notes }) { const { data, error } = await supabase.rpc('create_purchase_order', { p_supplier_name: supplierName, p_items: items, p_notes: notes || null }); if (error) throw error; return data }
export async function receivePurchaseOrder(id) { const { error } = await supabase.rpc('receive_purchase_order', { p_order_id: id }); if (error) throw error }
export async function cancelPurchaseOrder(id) { const { error } = await supabase.rpc('cancel_purchase_order', { p_order_id: id }); if (error) throw error }
export async function deletePurchaseOrder(id) { const { error } = await supabase.rpc('delete_purchase_order', { p_order_id: id }); if (error) throw error }
