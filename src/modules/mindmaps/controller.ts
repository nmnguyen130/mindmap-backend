import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import * as mindmapService from './service';
import * as unifiedService from './unified';
import { success } from '@/utils/response';
import { CreateMindmapInput, UpdateMindmapInput } from './schemas';
import { ValidationError } from '@/utils/errors';

/**
 * POST /api/mindmaps
 */
export const create = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const body = req.body as CreateMindmapInput;

        const mindmap = await mindmapService.createMindmap(
            userId,
            body.title,
            body.source_file_id
        );

        success(res, mindmap, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/mindmaps
 */
export const list = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const mindmaps = await mindmapService.listMindmaps(userId);
        success(res, mindmaps);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/mindmaps/:id
 */
export const get = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const mindmapId = req.params.id;
        if (!mindmapId) {
            throw new Error('Mindmap ID is required');
        }

        const mindmap = await mindmapService.getMindmap(mindmapId, userId);
        success(res, mindmap);
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /api/mindmaps/:id
 */
export const update = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const mindmapId = req.params.id;
        if (!mindmapId) {
            throw new Error('Mindmap ID is required');
        }
        const body = req.body as UpdateMindmapInput;

        const mindmap = await mindmapService.updateMindmap(mindmapId, userId, body);
        success(res, mindmap);
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /api/mindmaps/:id
 */
export const remove = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const mindmapId = req.params.id;
        if (!mindmapId) {
            throw new Error('Mindmap ID is required');
        }

        await mindmapService.deleteMindmap(mindmapId, userId);
        success(res, { deleted: true });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/mindmaps/create-from-pdf
 * Unified workflow: Upload PDF → Store → Generate Mindmap → Chunk → Link
 */
export const createFromPdf = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;

        // Check if file was uploaded
        if (!req.file) {
            throw new ValidationError('PDF file is required');
        }

        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const customTitle = req.body.title;

        // Execute unified workflow
        const result = await unifiedService.createMindmapFromPdf(
            userId,
            fileBuffer,
            fileName,
            customTitle
        );

        success(res, result, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/mindmaps/:mindmapId/nodes/:nodeId/chat
 * Chat with specific node's context (scoped RAG)
 */
export const chatWithNode = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { mindmapId, nodeId } = req.params;
        const { question, stream = true } = req.body;

        if (!mindmapId || !nodeId) {
            throw new ValidationError('Mindmap ID and Node ID are required');
        }

        if (!question) {
            throw new ValidationError('Question is required');
        }

        if (stream) {
            // Set headers for SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const responseStream = unifiedService.chatWithNode(
                mindmapId,
                nodeId,
                question,
                userId
            );

            for await (const chunk of responseStream) {
                res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            }

            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            // Non-streaming response
            const responseStream = unifiedService.chatWithNode(
                mindmapId,
                nodeId,
                question,
                userId
            );

            let fullResponse = '';
            for await (const chunk of responseStream) {
                fullResponse += chunk;
            }

            success(res, { answer: fullResponse });
        }
    } catch (error) {
        next(error);
    }
};
