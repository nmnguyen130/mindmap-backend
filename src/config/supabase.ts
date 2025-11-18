import { createClient } from '@supabase/supabase-js'
import { env } from './env'

export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export function createUserSupabaseClient(jwt: string) {
  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`
      }
    }
  })
  
  // Set the session to ensure auth.uid() works in RLS policies
  // This is a workaround since we're using server-side authentication
  // The JWT should already contain the user context
  return client
}
