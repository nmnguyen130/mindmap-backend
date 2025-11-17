import { Router } from 'express'
import * as Ctrl from '../controllers/ai.controller'
import { requireAuth } from '../middlewares/auth'

const r = Router()

r.post('/generate', requireAuth, Ctrl.generate)
r.post('/suggest', requireAuth, Ctrl.suggest)
r.post('/summarize', requireAuth, Ctrl.summarize)
r.post('/chat', requireAuth, Ctrl.chat)
r.post('/analyze', requireAuth, Ctrl.analyze)
r.post('/convert', requireAuth, Ctrl.convert)

export default r
