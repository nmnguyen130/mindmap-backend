import { Response } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import { success } from '@/utils/response';
import { ValidationError } from '@/utils/errors';

import * as mindmapService from './service';
import * as unifiedService from './unified';
import { CreateMindmapInput, UpdateMindmapInput } from './schemas';

/**
 * POST /api/mindmaps/create-from-pdf
 * Unified workflow: Upload PDF → Store → Generate Mindmap → Chunk → Link
 */
export const createFromPdf = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;

    // Check if file was uploaded
    if (!req.file) {
        throw new ValidationError('PDF file is required');
    }

    // Execute unified workflow
    const result = await unifiedService.createMindmapFromPdf({
        userId: user.id,
        accessToken,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        title: req.body.title,
    });

    success(res, result, 201);
};

/**
 * POST /api/mindmaps/:mindmapId/nodes/:nodeId/chat
 * Chat with specific node's context (scoped RAG)
 */
export const chatWithNode = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const { mindmapId, nodeId } = req.params;
    const { question, stream = true } = req.body;

    if (!mindmapId || !nodeId) {
        throw new ValidationError('Mindmap ID and Node ID are required');
    }

    if (!question) {
        throw new ValidationError('Question is required');
    }

    const chatStream = unifiedService.chatWithNode({
        userId: user.id,
        accessToken,
        mindmapId,
        nodeId,
        question,
    });

    // Streaming response (SSE)
    if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        try {
            for await (const chunk of chatStream) {
                res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            }
            res.write('data: [DONE]\n\n');
        } catch (error) {
            res.write('data: [ERROR]\n\n');
        } finally {
            res.end();
        }
    } else {
        let answer = '';
        for await (const chunk of chatStream) answer += chunk;
        success(res, { answer });
    }
};

/**
 * POST /api/mindmaps
 */
export const create = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const body = req.body as CreateMindmapInput;

    const mindmap = await mindmapService.createMindmap({
        userId: user.id,
        accessToken,
        title: body.title,
        sourceFileId: body.source_file_id,
    });

    success(res, mindmap, 201);
};

/**
 * GET /api/mindmaps
 */
export const list = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;

    const mindmaps = await mindmapService.listMindmaps({
        userId: user.id,
        accessToken,
    });

    success(res, mindmaps);
};

/**
 * GET /api/mindmaps/:id
 */
export const get = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const { id } = req.params;

    if (!id) {
        throw new Error('Mindmap ID is required');
    }

    const mindmap = await mindmapService.getMindmap({
        userId: user.id,
        accessToken,
        mindmapId: id,
    });

    success(res, mindmap);
};

/**
 * PUT /api/mindmaps/:id
 */
export const update = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const { id } = req.params;

    if (!id) {
        throw new Error('Mindmap ID is required');
    }

    const body = req.body as UpdateMindmapInput;

    const mindmap = await mindmapService.updateMindmap({
        userId: user.id,
        accessToken,
        mindmapId: id,
        updates: body,
    });

    success(res, mindmap);
};

/**
 * DELETE /api/mindmaps/:id
 */
export const remove = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const { id } = req.params;

    if (!id) {
        throw new Error('Mindmap ID is required');
    }

    await mindmapService.deleteMindmap({
        userId: user.id,
        accessToken,
        mindmapId: id,
    });

    success(res, { deleted: true });
};