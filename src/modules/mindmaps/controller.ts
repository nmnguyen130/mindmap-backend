import { Response } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import { success } from '@/utils/response';

import * as mindmapService from './service';
import { CreateMindmapInput, UpdateMindmapInput } from './schemas';

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
        sourceDocumentId: body.source_document_id,
    });

    success(res, mindmap, 201);
};

/**
 * GET /api/mindmaps
 * Supports incremental sync with ?since= query parameter
 */
export const list = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const { since } = req.query;

    const mindmaps = await mindmapService.listMindmaps({
        userId: user.id,
        accessToken,
        since: since ? String(since) : undefined,
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