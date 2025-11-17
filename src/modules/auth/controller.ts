import { Request, Response, NextFunction } from 'express'
import { ApiResponseHelper } from '@/core/utils/response'
import { AuthedRequest, extractBearerToken } from '@/core/middlewares/auth'
import * as authService from '@/modules/auth/service'
import type { RegisterInput, LoginInput, RefreshTokenInput } from '@/modules/auth/validator'

export async function register(req: Request<{}, {}, RegisterInput>, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body
    const data = await authService.register(email, password)
    return ApiResponseHelper.created(res, data)
  } catch (error) {
    next(error)
  }
}

export async function login(req: Request<{}, {}, LoginInput>, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body
    const data = await authService.login(email, password)
    return ApiResponseHelper.success(res, data)
  } catch (error) {
    next(error)
  }
}

export async function refresh(req: Request<{}, {}, RefreshTokenInput>, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body
    const data = await authService.refresh(refreshToken)
    return ApiResponseHelper.success(res, data)
  } catch (error) {
    next(error)
  }
}

export async function me(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user?.id) {
      return ApiResponseHelper.unauthorized(res)
    }

    const profile = await authService.getProfile(req.user.id)
    return ApiResponseHelper.success(res, profile)
  } catch (error) {
    next(error)
  }
}

export async function logout(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req)

    if (!token) {
      return ApiResponseHelper.unauthorized(res, 'No token provided')
    }

    const data = await authService.logout(token)
    return ApiResponseHelper.success(res, data)
  } catch (error) {
    next(error)
  }
}
