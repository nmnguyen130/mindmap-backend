import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '@/middlewares/auth';
import { validate } from '@/middlewares/validation';
import { createMindmapSchema, updateMindmapSchema, chatWithNodeSchema } from './schemas';
import * as mindmapController from './controller';

const router = Router();

// Configure multer for PDF uploads (in-memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
});

// All routes require authentication
router.use(authenticate);

// POST /api/mindmaps/create-from-pdf - Unified workflow: upload + mindmap + chunks
router.post(
    '/create-from-pdf',
    upload.single('file'),
    mindmapController.createFromPdf
);

// POST /api/mindmaps/:mindmapId/nodes/:nodeId/chat - Chat with node context
router.post(
    '/:mindmapId/nodes/:nodeId/chat',
    validate(chatWithNodeSchema, 'body'),
    mindmapController.chatWithNode
);

// POST /api/mindmaps - Create empty mindmap
router.post(
    '/',
    validate(createMindmapSchema, 'body'),
    mindmapController.create
);

// GET /api/mindmaps - List all user mindmaps
router.get('/', mindmapController.list);

// GET /api/mindmaps/:id - Get mindmap with nodes
router.get('/:id', mindmapController.get);

// PUT /api/mindmaps/:id - Update mindmap
router.put(
    '/:id',
    validate(updateMindmapSchema, 'body'),
    mindmapController.update
);

// DELETE /api/mindmaps/:id - Delete mindmap
router.delete('/:id', mindmapController.remove);

export default router;
