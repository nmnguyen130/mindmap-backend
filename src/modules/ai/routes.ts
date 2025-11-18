import { Router } from 'express'
import { requireAuth } from '@/core/middlewares/auth'
import * as Ctrl from './controller'

const router = Router()

// Full endpoints (require auth and database)
router.post('/generate', requireAuth, Ctrl.generate)
router.post('/suggest', requireAuth, Ctrl.suggest)
router.post('/summarize', requireAuth, Ctrl.summarize)
router.post('/chat', requireAuth, Ctrl.chat)
router.post('/analyze', requireAuth, Ctrl.analyze)
router.post('/convert', requireAuth, Ctrl.convert)

export default router
