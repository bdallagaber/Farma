import { supabase } from '../lib/supabase'

export async function loadNotifications() {
  const { data, error } = await supabase
    .from('app_notifications')
    .select('id,type,title,body,link,created_at,read_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('app_notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
