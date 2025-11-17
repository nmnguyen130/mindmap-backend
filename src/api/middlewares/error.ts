import { NextFunction, Request, Response } from 'express'
import { logger } from '../../utils/logger'

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status || 500
  logger.error({ err }, 'Unhandled error')
  res.status(status).json({ error: err.message || 'Internal Server Error' })
}
