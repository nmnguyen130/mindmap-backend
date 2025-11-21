import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/utils/errors';
import { error as errorResponse } from '@/utils/response';
import { logger } from '@/utils/logger';

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    // Log error
    logger.error({
        err,
        url: req.url,
        method: req.method,
        ip: req.ip,
    });

    // Handle Zod validation errors
    if (err instanceof ZodError) {
        const message = err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
        errorResponse(res, message, 400, 'VALIDATION_ERROR');
        return;
    }

    // Handle custom app errors
    if (err instanceof AppError) {
        errorResponse(res, err.message, err.statusCode);
        return;
    }

    // Handle unknown errors
    const isDev = process.env.NODE_ENV === 'development';
    errorResponse(
        res,
        isDev ? err.message : 'Internal server error',
        500,
        'INTERNAL_ERROR'
    );
};
