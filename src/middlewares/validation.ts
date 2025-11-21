import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from '@/utils/errors';

type ValidationType = 'body' | 'query' | 'params';

export const validate = (schema: ZodSchema, type: ValidationType = 'body') => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const data = req[type];
            const validated = await schema.parseAsync(data);
            req[type] = validated;
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                const message = error.issues
                    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                    .join(', ');
                next(new ValidationError(message));
            } else {
                next(error);
            }
        }
    };
};
