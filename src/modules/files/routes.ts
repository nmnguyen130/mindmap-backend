import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '@/core/middlewares/auth'
import * as Ctrl from '@/modules/files/controller'

const router = Router()

// Configure multer for file uploads
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Only allow PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are allowed'))
    }
  }
})

router.post('/upload', requireAuth, upload.single('file'), Ctrl.uploadFile)
router.post('/process-pdf/:fileId', requireAuth, Ctrl.processPDF)
router.get('/', requireAuth, Ctrl.getFiles)
router.delete('/:id', requireAuth, Ctrl.deleteFile)

export default router
