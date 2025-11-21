import { Router } from 'express';
import { authenticate } from '@/middlewares/auth';
import { validate } from '@/middlewares/validation';
import { createConversationSchema, updateConversationSchema } from './schemas';
import * as conversationController from './controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/conversations - Create conversation
router.post(
    '/',
    validate(createConversationSchema, 'body'),
    conversationController.create
);

// GET /api/conversations - List all user conversations
router.get('/', conversationController.list);

// GET /api/conversations/:id - Get conversation with messages
router.get('/:id', conversationController.get);

// PUT /api/conversations/:id - Update conversation
router.put(
    '/:id',
    validate(updateConversationSchema, 'body'),
    conversationController.update
);

// DELETE /api/conversations/:id - Delete conversation
router.delete('/:id', conversationController.remove);

export default router;
