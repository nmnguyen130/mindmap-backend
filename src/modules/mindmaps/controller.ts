import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import * as mindmapService from './service';
import { success } from '@/utils/response';
import { CreateMindmapInput, UpdateMindmapInput } from './schemas';

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
