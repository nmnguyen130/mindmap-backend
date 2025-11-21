import { Request, Response, NextFunction } from 'express';
import { supabase } from '@/config/supabase';
import { AuthenticationError } from '@/utils/errors';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email?: string;
    };
    accessToken?: string;
}

export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AuthenticationError('No token provided');
        }

        const token = authHeader.substring(7);

        // Verify token with Supabase
        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data.user) {
            throw new AuthenticationError('Invalid or expired token');
        }

        // Attach user info to request
        req.user = {
            id: data.user.id,
            email: data.user.email,
        };
        req.accessToken = token;

        next();
    } catch (error) {
        next(error);
    }
};

// Optional auth - doesn't throw if no token
export const optionalAuth = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.substring(7);
        const { data } = await supabase.auth.getUser(token);

        if (data.user) {
            req.user = {
                id: data.user.id,
                email: data.user.email,
            };
            req.accessToken = token;
        }

        next();
    } catch (error) {
        // Continue without auth on error
        next();
    }
};
