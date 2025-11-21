import { supabase } from '@/config/supabase';
import { AuthenticationError, ConflictError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export interface AuthResult {
    access_token: string;
    refresh_token: string;
    user: {
        id: string;
        email: string;
    };
}

export interface UserInfo {
    id: string;
    email: string;
}

/**
 * Register new user
 */
export const register = async (
    email: string,
    password: string
): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        logger.error({ error }, 'Registration failed');
        if (error.message.includes('already registered')) {
            throw new ConflictError('Email already registered');
        }
        throw new Error(error.message);
    }

    if (!data.session || !data.user) {
        throw new Error('Registration succeeded but no session created');
    }

    return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: {
            id: data.user.id,
            email: data.user.email!,
        },
    };
};

/**
 * Login user
 */
export const login = async (email: string, password: string): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        logger.error({ error }, 'Login failed');
        throw new AuthenticationError('Invalid email or password');
    }

    if (!data.session || !data.user) {
        throw new AuthenticationError('Login failed');
    }

    return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: {
            id: data.user.id,
            email: data.user.email!,
        },
    };
};

/**
 * Refresh access token
 */
export const refreshToken = async (refreshToken: string): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
    });

    if (error || !data.session) {
        logger.error({ error }, 'Token refresh failed');
        throw new AuthenticationError('Invalid or expired refresh token');
    }

    return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: {
            id: data.user!.id,
            email: data.user!.email!,
        },
    };
};

/**
 * Get current user info
 */
export const getCurrentUser = async (accessToken: string): Promise<UserInfo> => {
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
        throw new AuthenticationError('Invalid or expired token');
    }

    return {
        id: data.user.id,
        email: data.user.email!,
    };
};
