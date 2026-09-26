import { supabase } from '../lib/supabase'

export async function loadInventoryAudit({ action = 'all', entityType = 'all', search = '', dateFrom = '', dateTo = '' } = {}) {
  let query = supabase.from('inventory_audit_log').select('id,entity_type,entity_id,action,changed_by,old_values,new_values,created_at,profiles(full_name,email)').order('created_at', { ascending: false }).limit(500)
  if (action !== 'all') query = query.eq('action', action)
  if (entityType !== 'all') query = query.eq('entity_type', entityType)
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`)
  if (dateTo) { const end = new Date(`${dateTo}T00:00:00.000Z`); end.setUTCDate(end.getUTCDate() + 1); query = query.lt('created_at', end.toISOString()) }
  const { data, error } = await query
  if (error) throw error
  return (data || []).filter(row => !search.trim() || JSON.stringify(row).toLowerCase().includes(search.trim().toLowerCase()))
}
