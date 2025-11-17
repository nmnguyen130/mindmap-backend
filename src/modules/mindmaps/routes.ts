import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '@/core/middlewares/auth'
import { validate } from '@/core/middlewares/validate'
import * as Ctrl from './controller'
import { mindMapCreateSchema, mindMapUpdateSchema } from './validator'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// Mindmaps routes
router.get('/mindmaps', requireAuth, Ctrl.listMindMaps)
router.post('/mindmaps', requireAuth, validate(mindMapCreateSchema), Ctrl.createMindMap)
router.get('/mindmaps/:id', requireAuth, Ctrl.getMindMap)
router.put('/mindmaps/:id', requireAuth, validate(mindMapUpdateSchema), Ctrl.updateMindMap)
router.delete('/mindmaps/:id', requireAuth, Ctrl.deleteMindMap)

// Nodes routes
router.get('/mindmaps/:id/nodes', requireAuth, Ctrl.listNodes)
router.post('/mindmaps/:id/nodes', requireAuth, Ctrl.addNode)
router.put('/nodes/:id', requireAuth, Ctrl.updateNode)
router.delete('/nodes/:id', requireAuth, Ctrl.deleteNode)

// Files routes
router.post('/files/upload', requireAuth, upload.single('file'), Ctrl.upload)
router.get('/files', requireAuth, Ctrl.list)
router.delete('/files/:id', requireAuth, Ctrl.remove)

export default router
