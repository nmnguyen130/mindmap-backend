import { NextFunction, Request, Response } from 'express'
import { supabaseAdmin, createUserSupabaseClient } from '../../config/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuthedRequest extends Request {
  user?: { id: string; email?: string }
  supabase?: SupabaseClient
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
    const token = auth.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data.user) return res.status(401).json({ error: 'Invalid token' })
    req.user = { id: data.user.id, email: data.user.email || undefined }
    // Per-request client that honors RLS with user's JWT
    req.supabase = createUserSupabaseClient(token)
    return next()
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}
