import { Router } from 'express'
import { requireAuth } from '@/core/middlewares/auth'
import { validate } from '@/core/middlewares/validate'
import * as Ctrl from './controller'
import { registerSchema, loginSchema, refreshTokenSchema } from './validator'

const router = Router()

// Public routes
router.post('/register', validate(registerSchema), Ctrl.register)
router.post('/login', validate(loginSchema), Ctrl.login)
router.post('/refresh', validate(refreshTokenSchema), Ctrl.refresh)

// Protected routes
router.get('/me', requireAuth, Ctrl.me)
router.post('/logout', requireAuth, Ctrl.logout)

export default router
