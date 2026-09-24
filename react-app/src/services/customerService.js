import { supabase } from '../lib/supabase'

export async function loadCustomerWorkspace() {
  const [customers, ledger, sales, followups] = await Promise.all([
    supabase.from('customers').select('id,name,phone,whatsapp,area,address,location,notes,category,status,credit_limit,created_at').order('name').limit(2000),
    supabase.from('customer_ledger').select('id,customer_id,amount,note,created_at,entry_type').order('created_at', { ascending: false }).limit(5000),
    supabase.from('sales').select('id,sale_group_id,customer_id,product_id,quantity,unit_sold,sale_price,created_at,products(name)').not('customer_id', 'is', null).order('created_at', { ascending: false }).limit(5000),
    supabase.from('customer_followups').select('id,customer_id,followup_type,product_id,note,next_followup_date,status,created_at,products(name)').order('created_at', { ascending: false }).limit(5000),
  ])
  for (const result of [customers, ledger, sales, followups]) if (result.error) throw result.error
  return { customers: customers.data || [], ledger: ledger.data || [], sales: sales.data || [], followups: followups.data || [] }
}
export async function createCustomer(payload) { const { data, error } = await supabase.from('customers').insert(payload).select('id,name,phone,whatsapp,area,address,location,notes,category,status,credit_limit,created_at').single(); if (error) throw error; return data }
export async function updateCustomer(id, payload) { const { data, error } = await supabase.from('customers').update(payload).eq('id', id).select('id,name,phone,whatsapp,area,address,location,notes,category,status,credit_limit,created_at').single(); if (error) throw error; return data }
export async function addFollowup(payload) { const { error } = await supabase.from('customer_followups').insert(payload); if (error) throw error }
