import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import * as authService from './service';
import { success } from '@/utils/response';
import { RegisterInput, LoginInput, RefreshInput } from './schemas';

/**
 * POST /api/auth/register
 */
export const register = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const body = req.body as RegisterInput;
        const result = await authService.register(body.email, body.password);
        success(res, result, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/auth/login
 */
export const login = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const body = req.body as LoginInput;
        const result = await authService.login(body.email, body.password);
        success(res, result);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/auth/refresh
 */
export const refresh = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const body = req.body as RefreshInput;
        const result = await authService.refreshToken(body.refresh_token);
        success(res, result);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/auth/me
 */
export const me = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const user = await authService.getCurrentUser(req.accessToken!);
        success(res, user);
    } catch (error) {
        next(error);
    }
};
