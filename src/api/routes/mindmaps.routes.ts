import { Router } from 'express'
import * as Ctrl from '../controllers/mindmaps.controller'
import { requireAuth } from '../middlewares/auth'

const r = Router()

r.get('/', requireAuth, Ctrl.listMindMaps)
r.post('/', requireAuth, Ctrl.createMindMap)
r.get('/:id', requireAuth, Ctrl.getMindMap)
r.put('/:id', requireAuth, Ctrl.updateMindMap)
r.delete('/:id', requireAuth, Ctrl.deleteMindMap)

export default r
