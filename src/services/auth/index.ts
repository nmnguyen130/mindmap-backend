import { supabaseAdmin } from '../../config/supabase'

export async function register(email: string, password: string) {
  const { data, error } = await supabaseAdmin.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function login(email: string, password: string) {
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function refresh(refreshToken: string) {
  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken })
  if (error) throw new Error(error.message)
  return data
}
