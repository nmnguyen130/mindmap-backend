import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '@/config/supabase';
import { AuthenticationError } from '@/utils/errors';

export interface AuthRequest extends Request {
    user: {
        id: string;
        email?: string;
    };
    accessToken: string;
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

        // Verify token with Supabase Admin
        const { data, error } = await supabaseAdmin.auth.getUser(token);

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