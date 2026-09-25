import { supabase } from '../lib/supabase'

export async function loadCustomerWorkspace() {
  const [customers, ledger, sales, followups, invoices] = await Promise.all([
    supabase.from('customers').select('id,name,phone,whatsapp,area,address,location,notes,category,status,credit_limit,created_at').order('name').limit(2000),
    supabase.from('customer_ledger').select('id,customer_id,amount,note,created_at,entry_type').order('created_at', { ascending: false }).limit(5000),
    supabase.from('sales').select('id,sale_group_id,customer_id,product_id,quantity,unit_sold,sale_price,created_at,products(name)').not('customer_id', 'is', null).order('created_at', { ascending: false }).limit(5000),
    supabase.from('customer_followups').select('id,customer_id,followup_type,product_id,note,next_followup_date,status,created_at,products(name)').order('created_at', { ascending: false }).limit(5000),
    supabase.from('invoices').select('sale_group_id,invoice_number,customer_id,total,paid_amount,remaining_amount,payment_status,created_at').order('created_at', { ascending: false }).limit(5000),
  ])
  for (const result of [customers, ledger, sales, followups, invoices]) if (result.error) throw result.error
  return { customers: customers.data || [], ledger: ledger.data || [], sales: sales.data || [], followups: followups.data || [], invoices: invoices.data || [] }
}
export async function createCustomer(payload) { const { data, error } = await supabase.from('customers').insert(payload).select('id,name,phone,whatsapp,area,address,location,notes,category,status,credit_limit,created_at').single(); if (error) throw error; return data }
export async function updateCustomer(id, payload) { const { data, error } = await supabase.from('customers').update(payload).eq('id', id).select('id,name,phone,whatsapp,area,address,location,notes,category,status,credit_limit,created_at').single(); if (error) throw error; return data }
export async function addFollowup(payload) { const { error } = await supabase.from('customer_followups').insert(payload); if (error) throw error }
export async function addCustomerPayment({ customerId, saleGroupId, amount, note, userId, invoice }) {
  const { error } = await supabase.from('customer_ledger').insert({ customer_id: customerId, sale_group_id: saleGroupId || null, amount: -amount, entry_type: 'payment', note: note || (saleGroupId ? `دفعة على فاتورة #${invoice?.invoice_number || ''}` : 'دفعة من العميل'), created_by: userId })
  if (error) throw error
  if (invoice) { const paid = Number(invoice.paid_amount || 0) + amount; const remaining = Math.max(0, Number(invoice.total || 0) - paid); const result = await supabase.from('invoices').update({ paid_amount: paid, remaining_amount: remaining, payment_status: remaining === 0 ? 'paid' : 'partial', payment_updated_at: new Date().toISOString() }).eq('sale_group_id', saleGroupId); if (result.error) throw result.error }
}
