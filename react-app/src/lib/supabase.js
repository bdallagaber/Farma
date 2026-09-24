import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://xnppuzullfyxeqwxhyts.supabase.co'
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_XDFuq8hI4IEBRo-saeWRvQ_AP_U5WW0'

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'farma-auth' },
})
