import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// Service role client for admin operations (bypass RLS)
export const supabaseAdmin: SupabaseClient = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

// Anon client for user operations (respects RLS)
export const supabase: SupabaseClient = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY
);

// Helper to create per-request client with user JWT
export const createSupabaseClient = (accessToken: string): SupabaseClient => {
    return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
        auth: {
            persistSession: false,
        },
    });
};