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
    
    // Verify token with admin client first
    const { data, error } = await supabase.auth.getUser(token)
    
    if (error || !data.user) {
      console.error('Token verification failed:', error)
      throw new UnauthorizedError('Invalid or expired token')
    }
    
    console.log('Authenticated user:', data.user.id, data.user.email)
    
    req.user = { id: data.user.id, email: data.user.email || undefined }
    
    // Create per-request client that honors RLS with user's JWT
    // The JWT is passed in global headers so auth.uid() works in RLS policies
    req.supabase = createUserSupabaseClient(token)
    
    // Verify the user client can see the authenticated user
    const { data: userData, error: userError } = await req.supabase.auth.getUser()
    console.log('User client context:', userData?.user?.id, 'Error:', userError?.message)
    
    return next()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return next(error)
    }
    console.error('Authentication error:', error)
    return next(new UnauthorizedError('Authentication failed'))
  }
}
