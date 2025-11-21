import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '@/middlewares/auth';
import { validate } from '@/middlewares/validation';
import { ingestLimiter, chatLimiter } from '@/middlewares/rateLimiter';
import { ingestSchema, chatSchema } from './schemas';
import * as ragController from './controller';

const router = Router();

// Configure multer for file uploads (in-memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf' || file.mimetype === 'text/plain') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and TXT files are allowed'));
        }
    },
});

// POST /api/ingest - Upload and process document
router.post(
    '/ingest',
    authenticate,
    ingestLimiter,
    upload.single('file'),
    validate(ingestSchema, 'body'),
    ragController.ingest
);

// POST /api/chat - Chat with streaming
router.post(
    '/chat',
    authenticate,
    chatLimiter,
    validate(chatSchema, 'body'),
    ragController.chat
);

// POST /api/query - Query without streaming (alias)
router.post(
    '/query',
    authenticate,
    chatLimiter,
    validate(chatSchema, 'body'),
    ragController.query
);

export default router;
