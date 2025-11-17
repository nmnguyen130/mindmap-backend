import { NextFunction, Request, Response } from 'express'
import { ZodSchema, ZodError, ZodIssue } from 'zod'
import { ValidationError } from '@/core/utils/errors'

export const validate = (schema: ZodSchema) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.body)
      req.body = validated
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((err: ZodIssue) => ({
          field: err.path.join('.'),
          message: err.message,
        }))
        next(new ValidationError('Validation failed', errors))
      } else {
        next(error)
      }
    }
  }
}
