import { Router } from 'express';
import { authenticate } from '@/middlewares/auth';
import { validate } from '@/middlewares/validation';
import { uploadSinglePdf } from '@/middlewares/upload';
import { ragChatSchema } from './schemas';
import * as ragController from './controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/rag/create-from-pdf - Upload PDF and create document
router.post(
    '/create-from-pdf',
    uploadSinglePdf,
    ragController.createFromPdf
);

// POST /api/rag/chat - RAG chat (streaming)
router.post(
    '/chat',
    validate(ragChatSchema, 'body'),
    ragController.chat
);

// GET /api/rag/documents - List all user documents
router.get('/documents', ragController.list);

// GET /api/rag/documents/:id - Get document with sections
router.get('/documents/:id', ragController.get);

// DELETE /api/rag/documents/:id - Delete document
router.delete('/documents/:id', ragController.remove);

export default router;
