import { Request, Response } from "express";
import { AuthRequest } from "@/middlewares/auth";
import { success } from "@/utils/response";
import * as authService from "./service";
import {
  RegisterInput,
  LoginInput,
  RefreshInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  SocialLoginInput,
} from "./schemas";

/**
 * POST /api/auth/register
 */
export const register = async (req: Request, res: Response) => {
  const body = req.body as RegisterInput;
  const result = await authService.register(body.email, body.password);
  success(res, result, 201);
};

/**
 * POST /api/auth/login
 */
export const login = async (req: Request, res: Response) => {
  const body = req.body as LoginInput;
  const result = await authService.login(body.email, body.password);
  success(res, result);
};

/**
 * POST /api/auth/refresh
 */
export const refresh = async (req: Request, res: Response) => {
  const body = req.body as RefreshInput;
  const result = await authService.refreshToken(body.refresh_token);
  success(res, result);
};

/**
 * GET /api/auth/me
 */
export const me = async (req: AuthRequest, res: Response) => {
  const user = await authService.getCurrentUser(req.accessToken!);
  success(res, user);
};

/**
 * POST /api/auth/forgot-password
 */
export const forgotPassword = async (req: Request, res: Response) => {
  const body = req.body as ForgotPasswordInput;
  // For mobile apps, use deep linking scheme (e.g., frontend://reset-password)
  const appScheme = process.env.APP_SCHEME || "mindflow";
  const redirectTo = `${appScheme}://reset-password`;

  const result = await authService.forgotPassword(body.email, redirectTo);
  success(res, result);
};

/**
 * POST /api/auth/reset-password
 */
export const resetPassword = async (req: AuthRequest, res: Response) => {
  const body = req.body as ResetPasswordInput;
  const result = await authService.resetPassword(
    req.accessToken!,
    body.password
  );
  success(res, result);
};

/**
 * POST /api/auth/social/:provider
 */
export const socialLogin = async (req: Request, res: Response) => {
  const provider = req.params.provider as "google" | "facebook";

  // Validate provider
  if (provider !== "google" && provider !== "facebook") {
    return res.status(400).json({
      success: false,
      error: "Invalid provider. Must be google or facebook",
    });
  }

  // For mobile apps, use deep linking scheme
  // Note: Route groups like (auth) are stripped from URL paths in Expo Router
  const appScheme = process.env.APP_SCHEME || "mindflow";
  const redirectTo = `${appScheme}://auth/callback`;

  const result = await authService.socialLogin(provider, redirectTo);
  success(res, result);
};

/**
 * GET /api/auth/callback
 */
export const socialCallback = async (req: Request, res: Response) => {
  const { access_token, refresh_token } = req.query;

  if (!access_token || !refresh_token) {
    return res.status(400).json({
      success: false,
      error: "Missing access_token or refresh_token",
    });
  }

  const result = await authService.handleOAuthCallback(
    access_token as string,
    refresh_token as string
  );
  success(res, result);
};
