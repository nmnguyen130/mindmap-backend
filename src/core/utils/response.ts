import { Response } from 'express'

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export class ApiResponseHelper {
  static success<T>(res: Response, data: T, statusCode = 200): Response {
    return res.status(statusCode).json({
      success: true,
      data,
    } as ApiResponse<T>)
  }

  static created<T>(res: Response, data: T): Response {
    return this.success(res, data, 201)
  }

  static error(res: Response, error: string, statusCode = 500): Response {
    return res.status(statusCode).json({
      success: false,
      error,
    } as ApiResponse)
  }

  static badRequest(res: Response, error: string): Response {
    return this.error(res, error, 400)
  }

  static unauthorized(res: Response, error = 'Unauthorized'): Response {
    return this.error(res, error, 401)
  }

  static forbidden(res: Response, error = 'Forbidden'): Response {
    return this.error(res, error, 403)
  }

  static notFound(res: Response, error = 'Not found'): Response {
    return this.error(res, error, 404)
  }

  static validationError(res: Response, errors: any): Response {
    return res.status(422).json({
      success: false,
      error: 'Validation failed',
      errors,
    })
  }
}
