import { NextFunction, Request, Response } from 'express'
import { logger } from '@/core/utils/logger'
import { AppError, ValidationError } from '@/core/utils/errors'
import { ZodError } from 'zod'

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // Log error
  logger.error({ err }, 'Error occurred')

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      error: 'Validation failed',
      errors: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }

  // Handle custom ValidationError
  if (err instanceof ValidationError) {
    return res.status(422).json({
      success: false,
      error: err.message,
      errors: err.errors,
    })
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    })
  }

  // Handle Supabase errors
  if (err.code && err.message) {
    const status = err.status || 500
    return res.status(status).json({
      success: false,
      error: err.message,
    })
  }

  // Default error response
  const status = err.status || err.statusCode || 500
  const message = err.message || 'Internal Server Error'
  
  return res.status(status).json({
    success: false,
    error: message,
  })
}
