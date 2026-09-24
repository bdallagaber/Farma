import { supabase } from '../lib/supabase'

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export function subscribeToAuthChanges(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role,full_name,allowed_pages')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function signIn(identifier, password) {
  const email = identifier.includes('@')
    ? identifier.trim().toLowerCase()
    : `${identifier.trim().toLowerCase()}.pharmacy.local@gmail.com`
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

export function signOut() {
  return supabase.auth.signOut()
}
