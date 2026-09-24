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
