import { Response } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import * as conversationService from './service';
import { success } from '@/utils/response';
import { CreateConversationInput, UpdateConversationInput } from './schemas';

/**
 * POST /api/conversations
 */
export const create = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const body = req.body as CreateConversationInput;

    const conversation = await conversationService.createConversation({
        userId: user.id,
        accessToken,
        title: body.title,
        contextMode: body.context_mode,
    });

    success(res, conversation, 201);
};

/**
 * GET /api/conversations
 */
export const list = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const conversations = await conversationService.listConversations({
        userId: user.id,
        accessToken,
    });
    success(res, conversations);
};

/**
 * GET /api/conversations/:id
 */
export const get = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const { id } = req.params;
    if (!id) {
        throw new Error('Conversation ID is required');
    }

    const conversation = await conversationService.getConversation({
        userId: user.id,
        accessToken,
        conversationId: id,
    });
    success(res, conversation);
};

/**
* PUT /api/conversations/:id
 */
export const update = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const { id } = req.params;
    if (!id) {
        throw new Error('Conversation ID is required');
    }
    const body = req.body as UpdateConversationInput;

    const conversation = await conversationService.updateConversation({
        userId: user.id,
        accessToken,
        conversationId: id,
        title: body.title,
    });

    success(res, conversation);
};

/**
 * DELETE /api/conversations/:id
 */
export const remove = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const { id } = req.params;
    if (!id) {
        throw new Error('Conversation ID is required');
    }

    await conversationService.deleteConversation({
        userId: user.id,
        accessToken,
        conversationId: id,
    });
    success(res, { deleted: true });
};
