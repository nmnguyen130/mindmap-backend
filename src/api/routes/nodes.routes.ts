import { Router } from 'express'
import * as Ctrl from '../controllers/nodes.controller'
import { requireAuth } from '../middlewares/auth'

const r = Router()

r.get('/mindmaps/:id/nodes', requireAuth, Ctrl.listNodes)
r.post('/mindmaps/:id/nodes', requireAuth, Ctrl.addNode)
r.put('/nodes/:id', requireAuth, Ctrl.updateNode)
r.delete('/nodes/:id', requireAuth, Ctrl.deleteNode)

export default r
