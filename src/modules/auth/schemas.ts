import { z } from 'zod';

export const registerSchema = z.object({
    email: z.email({ error: 'Invalid email address' }),
    password: z.string()
        .min(8, { error: 'Password must be at least 8 characters' })
        .max(100, { error: 'Password must not exceed 100 characters' }),
});

export const loginSchema = z.object({
    email: z.email({ error: 'Invalid email address' }),
    password: z.string().min(1, { error: 'Password is required' }),
});

export const refreshSchema = z.object({
    refresh_token: z.string().min(1, { error: 'Refresh token is required' }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
