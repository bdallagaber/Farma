import { supabase } from '../lib/supabase'

export async function saveProduct(form, userId, editingId = null) {
  const retailAllowed = form.retailAllowed
  const hasStrip = retailAllowed && form.hasStrip
  const largeToMedium = retailAllowed ? Math.max(1, Number(form.largeToMedium) || 1) : null
  const mediumToSmall = Math.max(1, Number(form.mediumToSmall) || 1)
  const perBox = retailAllowed && hasStrip ? largeToMedium * mediumToSmall : mediumToSmall
  const payload = {
    name: form.name.trim(), name_en: form.nameEn.trim() || null,
    drug_type: form.drugType || 'other', shape: form.shape || 'other',
    classification: form.classification.trim() || null, supplier: form.supplier.trim() || null,
    active_ingredient: form.activeIngredient.trim() || null, concentration: form.concentration.trim() || null,
    retail_allowed: retailAllowed, unit_large: retailAllowed && hasStrip ? 'box' : null,
    unit_large_to_medium: retailAllowed && hasStrip ? largeToMedium : null,
    unit_medium: retailAllowed ? (hasStrip ? 'strip' : 'box') : 'box', unit_medium_to_small: mediumToSmall,
    unit_small: retailAllowed ? (hasStrip ? 'piece' : 'strip') : 'piece',
    expiry_date: form.expiryDate || null, min_stock_threshold: (Number(form.minThreshold) || 0) * perBox,
    default_sale_price: form.salePrice === '' ? null : Number(form.salePrice), qr_code: form.qrCode.trim() || null,
    sale_allowed_units: retailAllowed ? (hasStrip ? ['box', 'strip', 'piece'] : ['box', 'strip']) : ['box'],
    created_by: editingId ? undefined : userId,
  }
  let productId = editingId
  if (editingId) {
    const { error } = await supabase.from('products').update(payload).eq('id', editingId)
    if (error) throw error
    const { error: quantityError } = await supabase.from('inventory').update({ quantity_smallest_unit: getQuantity(form, perBox) }).eq('product_id', editingId)
    if (quantityError) throw quantityError
  } else {
    const { data, error } = await supabase.from('products').insert(payload).select('id').single()
    if (error) throw error
    productId = data.id
    const { error: inventoryError } = await supabase.from('inventory').insert({ product_id: productId, quantity_smallest_unit: getQuantity(form, perBox) })
    if (inventoryError) { await supabase.from('products').delete().eq('id', productId); throw inventoryError }
  }
  return productId
}

function getQuantity(form, perBox) { return (Number(form.boxesQuantity) || 0) * perBox + (Number(form.leftoverMedium) || 0) * (Number(form.mediumToSmall) || 1) + (Number(form.leftoverSmall) || 0) }
export async function updateQuantity(productId, boxes, perBox) { const { error } = await supabase.from('inventory').update({ quantity_smallest_unit: Number(boxes) * Number(perBox) }).eq('product_id', productId); if (error) throw error }
export async function deleteProduct(productId) { const { error } = await supabase.from('products').delete().eq('id', productId); if (error) throw error }
