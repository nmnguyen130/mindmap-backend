import rateLimit from 'express-rate-limit';
import { env } from '@/config/env';

// General rate limiter
export const generalLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict limiter for expensive operations (ingest)
export const ingestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Too many ingest requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Chat limiter
export const chatLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 60,
    message: 'Too many chat requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth limiter
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});
