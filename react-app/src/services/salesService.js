import { supabase } from '../lib/supabase'

export async function loadSaleProducts() {
  const result = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('products').select('id,name,name_en,shape,retail_allowed,sale_allowed_units,qr_code,unit_large,unit_large_to_medium,unit_medium,unit_medium_to_small,unit_small,other_note,default_sale_price,inventory(quantity_smallest_unit)').order('name').range(from, from + 999)
    if (error) throw error
    result.push(...(data || []))
    if (!data || data.length < 1000) return result
  }
}
export async function loadCustomers() { const { data, error } = await supabase.from('customers').select('id,name,phone,credit_limit').order('name').limit(2000); if (error) throw error; return data || [] }
export async function findProductsByBarcode(code) { const term = code.trim(); if (!term) return []; const [{ data: direct }, { data: extra }] = await Promise.all([supabase.from('products').select('id,name,name_en,shape,retail_allowed,sale_allowed_units,qr_code,unit_large,unit_large_to_medium,unit_medium,unit_medium_to_small,unit_small,other_note,default_sale_price,inventory(quantity_smallest_unit)').eq('qr_code', term).limit(5), supabase.from('product_barcodes').select('product_id').eq('barcode', term).limit(5)]); const ids = (extra || []).map(row => row.product_id); if (!ids.length) return direct || []; const { data: extraProducts } = await supabase.from('products').select('id,name,name_en,shape,retail_allowed,sale_allowed_units,qr_code,unit_large,unit_large_to_medium,unit_medium,unit_medium_to_small,unit_small,other_note,default_sale_price,inventory(quantity_smallest_unit)').in('id', ids).limit(5); return [...(direct || []), ...(extraProducts || [])]
}
export async function createSale(payload) { const { data, error } = await supabase.rpc('create_sale_transaction', payload); if (error) throw error; return data }
