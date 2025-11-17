import { NextFunction, Request, Response } from 'express'
import { supabase, createUserSupabaseClient } from '@/config/supabase'
import { UnauthorizedError } from '@/core/utils/errors'
import type { SupabaseClient } from '@supabase/supabase-js'

export function extractBearerToken(req: Request): string | undefined {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return undefined
  return auth.split(' ')[1]
}

export interface AuthedRequest extends Request {
  user?: { id: string; email?: string }
  supabase?: SupabaseClient
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization
    
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No authorization token provided')
    }
    
    const token = auth.split(' ')[1]
    if (!token) {
      throw new UnauthorizedError('Invalid authorization token format')
    }
    
    const { data, error } = await supabase.auth.getUser(token)
    
    if (error || !data.user) {
      throw new UnauthorizedError('Invalid or expired token')
    }
    
    req.user = { id: data.user.id, email: data.user.email || undefined }
    // Per-request client that honors RLS with user's JWT
    req.supabase = createUserSupabaseClient(token)
    
    return next()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return next(error)
    }
    return next(new UnauthorizedError('Authentication failed'))
  }
}
