import { supabase, supabaseAdmin } from '@/config/supabase'
import { UnauthorizedError, BadRequestError } from '@/core/utils/errors'
import type { User } from '@supabase/supabase-js'
import type { AuthUser } from '@/shared/types'

function createUserResponse(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email!,
  }
}

export async function register(email: string, password: string) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    if (error.message.includes('already registered')) {
      throw new BadRequestError('Email already registered')
    }
    throw new BadRequestError(error.message)
  }

  if (!data.user) {
    throw new BadRequestError('Failed to create user')
  }

  // After creating, sign in to get session
  const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

  if (signInError) {
    throw new BadRequestError('User created but failed to sign in')
  }

  return {
    user: createUserResponse(data.user),
    accessToken: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
    expiresAt: sessionData.session.expires_at,
  }
}

export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    throw new UnauthorizedError('Invalid email or password')
  }

  if (!data.user || !data.session) {
    throw new UnauthorizedError('Invalid email or password')
  }

  return {
    user: createUserResponse(data.user),
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
  }
}

export async function refresh(refreshToken: string) {
  if (!refreshToken) {
    throw new BadRequestError('Refresh token is required')
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })

  if (error) {
    throw new UnauthorizedError('Invalid or expired refresh token')
  }

  if (!data.session) {
    throw new UnauthorizedError('Failed to refresh session')
  }

  return {
    user: data.user ? createUserResponse(data.user) : null,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
  }
}

export async function logout(accessToken: string) {
  if (!accessToken) {
    throw new BadRequestError('Access token is required')
  }

  // Verify token and sign out
  const { error } = await supabaseAdmin.auth.admin.signOut(accessToken)

  if (error) {
    // Don't throw error on logout - best effort
    return { message: 'Logged out (with warnings)' }
  }

  return { message: 'Logged out successfully' }
}

export async function getProfile(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)

  if (error || !data.user) {
    throw new UnauthorizedError('User not found')
  }

  return {
    id: data.user.id,
    email: data.user.email,
    emailVerified: data.user.email_confirmed_at !== null,
    createdAt: data.user.created_at,
  }
}
