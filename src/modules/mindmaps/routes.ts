import { Router } from 'express';
import { authenticate } from '@/middlewares/auth';
import { validate } from '@/middlewares/validation';
import { createMindmapSchema, updateMindmapSchema } from './schemas';
import * as mindmapController from './controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/mindmaps - Create mindmap
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
