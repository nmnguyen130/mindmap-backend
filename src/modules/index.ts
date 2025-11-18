import { Router } from 'express'
import authRoutes from '@/modules/auth/routes'
import aiRoutes from '@/modules/ai/routes'
import mindmapsRoutes from '@/modules/mindmaps/routes'
import filesRoutes from '@/modules/files/routes'

const api = Router()

api.use('/auth', authRoutes)
api.use('/ai', aiRoutes)
api.use('/files', filesRoutes)
api.use('/', mindmapsRoutes)

export default api
