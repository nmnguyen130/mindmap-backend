import { Router } from 'express'
import multer from 'multer'
import * as Ctrl from '../controllers/files.controller'
import { requireAuth } from '../middlewares/auth'

const r = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

r.post('/upload', requireAuth, upload.single('file'), Ctrl.upload)
r.get('/', requireAuth, Ctrl.list)
r.delete('/:id', requireAuth, Ctrl.remove)

export default r
