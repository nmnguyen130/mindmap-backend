import { Request, Response } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import { success } from '@/utils/response';
import * as authService from './service';
import { RegisterInput, LoginInput, RefreshInput } from './schemas';

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
