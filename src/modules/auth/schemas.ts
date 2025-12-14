import { z } from "zod";

export const registerSchema = z.object({
  email: z.email({ error: "Invalid email address" }),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters" })
    .max(100, { error: "Password must not exceed 100 characters" }),
});

export const loginSchema = z.object({
  email: z.email({ error: "Invalid email address" }),
  password: z.string().min(1, { error: "Password is required" }),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, { error: "Refresh token is required" }),
});

export const forgotPasswordSchema = z.object({
  email: z.email({ error: "Invalid email address" }),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters" })
    .max(100, { error: "Password must not exceed 100 characters" }),
});

export const socialLoginSchema = z.object({
  provider: z.enum(["google", "facebook"], {
    error: "Provider must be either google or facebook",
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SocialLoginInput = z.infer<typeof socialLoginSchema>;
