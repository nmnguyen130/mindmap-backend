import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import * as conversationService from './service';
import { success } from '@/utils/response';
import { CreateConversationInput, UpdateConversationInput } from './schemas';

/**
 * POST /api/conversations
 */
export const create = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const body = req.body as CreateConversationInput;

        const conversation = await conversationService.createConversation(
            userId,
            body.title,
            body.context_mode
        );

        success(res, conversation, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/conversations
 */
export const list = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversations = await conversationService.listConversations(userId);
        success(res, conversations);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/conversations/:id
 */
export const get = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversationId = req.params.id;
        if (!conversationId) {
            throw new Error('Conversation ID is required');
        }

        const conversation = await conversationService.getConversation(conversationId, userId);
        success(res, conversation);
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /api/conversations/:id
 */
export const update = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversationId = req.params.id;
        if (!conversationId) {
            throw new Error('Conversation ID is required');
        }
        const body = req.body as UpdateConversationInput;

        const conversation = await conversationService.updateConversation(
            conversationId,
            userId,
            body.title
        );

        success(res, conversation);
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /api/conversations/:id
 */
export const remove = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversationId = req.params.id;
        if (!conversationId) {
            throw new Error('Conversation ID is required');
        }

        await conversationService.deleteConversation(conversationId, userId);
        success(res, { deleted: true });
    } catch (error) {
        next(error);
    }
};
