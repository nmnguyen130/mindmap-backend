import { Router } from 'express'
import * as Ctrl from '../controllers/auth.controller'
import { requireAuth } from '../middlewares/auth'

const r = Router()

r.post('/register', Ctrl.register)
r.post('/login', Ctrl.login)
r.post('/refresh', Ctrl.refresh)
r.get('/me', requireAuth, Ctrl.me)

export default r
