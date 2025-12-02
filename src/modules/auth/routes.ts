import { Router } from 'express';
import { authenticate } from '@/middlewares/auth';
import { validate } from '@/middlewares/validation';
import { authLimiter } from '@/middlewares/rateLimiter';
import {
    registerSchema,
    loginSchema,
    refreshSchema,
    forgotPasswordSchema,
    resetPasswordSchema
} from './schemas';
import * as authController from './controller';

const router = Router();

// POST /api/auth/register
router.post(
    '/register',
    authLimiter,
    validate(registerSchema, 'body'),
    authController.register
);

// POST /api/auth/login
router.post(
    '/login',
    authLimiter,
    validate(loginSchema, 'body'),
    authController.login
);

// POST /api/auth/refresh
router.post(
    '/refresh',
    validate(refreshSchema, 'body'),
    authController.refresh
);

// GET /api/auth/me
router.get('/me', authenticate, authController.me);

// POST /api/auth/forgot-password
router.post(
    '/forgot-password',
    authLimiter,
    validate(forgotPasswordSchema, 'body'),
    authController.forgotPassword
);

// POST /api/auth/reset-password
router.post(
    '/reset-password',
    authenticate,
    validate(resetPasswordSchema, 'body'),
    authController.resetPassword
);

// POST /api/auth/social/:provider (google or facebook)
router.post(
    '/social/:provider',
    authController.socialLogin
);

// GET /api/auth/callback (OAuth callback)
router.get(
    '/callback',
    authController.socialCallback
);

export default router;
