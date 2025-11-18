import 'dotenv/config'

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  logLevel: process.env.LOG_LEVEL || 'info',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || '',
  supabaseDbSchema: process.env.SUPABASE_DB_SCHEMA || 'public',
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'files',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
}

export function assertEnv() {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env: ${key}`)
    }
  }
}
