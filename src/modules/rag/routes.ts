import { Router } from 'express';
import { authenticate } from '@/middlewares/auth';
import { validate } from '@/middlewares/validation';
import { chatLimiter } from '@/middlewares/rateLimiter';
import { chatSchema } from './schemas';
import * as ragController from './controller';

const router = Router();

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
