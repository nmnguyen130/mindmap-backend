import { z } from 'zod'

export const registerSchema = z.object({
  email: z.email().min(1, {message: 'Email is required'}),
  password: z
    .string()
    .min(8, {message: 'Password must be at least 8 characters'})
    .max(128, {message: 'Password must not exceed 128 characters'})
    .refine(val => /[a-z]/.test(val), {message: 'Password must contain at least one lowercase letter'})
    .refine(val => /[0-9]/.test(val), {message: 'Password must contain at least one number'}),
})

export const loginSchema = z.object({
  email: z.email().min(1, {message: 'Email is required'}),
  password: z.string().min(1, {message: 'Password is required'}),
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, {message: 'Refresh token is required'}),
})

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>
export type LogoutInput = z.infer<typeof logoutSchema>
