import { Router } from 'express'
import auth from './auth.routes'
import mindmaps from './mindmaps.routes'
import nodes from './nodes.routes'
import files from './files.routes'
import ai from './ai.routes'

const api = Router()

api.use('/auth', auth)
api.use('/mindmaps', mindmaps)
api.use('/', nodes)
api.use('/files', files)
api.use('/ai', ai)

export default api
