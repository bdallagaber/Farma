import { supabase } from '../lib/supabase'

export async function listExtraBarcodes(productId) {
  const { data, error } = await supabase.from('product_barcodes').select('id,barcode').eq('product_id', productId).order('created_at')
  if (error) throw error
  return data || []
}
export async function addExtraBarcode(productId, barcode) {
  const { error } = await supabase.from('product_barcodes').insert({ product_id: productId, barcode: barcode.trim() })
  if (error) throw error
}
export async function removeExtraBarcode(id) {
  const { error } = await supabase.from('product_barcodes').delete().eq('id', id)
  if (error) throw error
}

export async function findInventoryProductByBarcode(code) {
  const value = code.trim()
  if (!value) return null
  const fields = 'id,name,name_en,drug_type,shape,classification,supplier,active_ingredient,concentration,retail_allowed,expiry_date,default_sale_price,min_stock_threshold,qr_code,unit_large,unit_large_to_medium,unit_medium,unit_medium_to_small,unit_small'
  const { data: direct, error: directError } = await supabase.from('products').select(fields).eq('qr_code', value).limit(1)
  if (directError) throw directError
  if (direct?.[0]) return direct[0]
  const { data: extra, error: extraError } = await supabase.from('product_barcodes').select('product_id').eq('barcode', value).limit(1)
  if (extraError) throw extraError
  if (!extra?.[0]) return null
  const { data, error } = await supabase.from('products').select(fields).eq('id', extra[0].product_id).limit(1)
  if (error) throw error
  return data?.[0] || null
}
