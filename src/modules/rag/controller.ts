import { Response } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import * as ragService from './service';
import { success } from '@/utils/response';
import { ProcessDocumentInput, RagChatInput } from './schemas';

/**
 * POST /api/rag/process
 */
export const process = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const body = req.body as ProcessDocumentInput;

    const result = await ragService.processDocument({
        userId: user.id,
        accessToken,
        documentId: body.document_id,
    });

    success(res, result);
};

/**
 * POST /api/rag/chat
 * Stream RAG chat response
 */
export const chat = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const body = req.body as RagChatInput;

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const stream = ragService.ragChat({
            userId: user.id,
            accessToken,
            question: body.question,
            documentId: body.document_id,
            matchThreshold: body.match_threshold,
            matchCount: body.match_count,
        });

        for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err: any) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
    }
};

/**
 * GET /api/rag/documents
 */
export const list = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;

    const documents = await ragService.listDocuments({
        userId: user.id,
        accessToken,
    });

    success(res, documents);
};

/**
 * GET /api/rag/documents/:id
 */
export const get = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const { id } = req.params;

    if (!id) {
        throw new Error('Document ID is required');
    }

    const document = await ragService.getDocument({
        userId: user.id,
        accessToken,
        documentId: id,
    });

    success(res, document);
};

/**
 * DELETE /api/rag/documents/:id
 */
export const remove = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const { id } = req.params;

    if (!id) {
        throw new Error('Document ID is required');
    }

    await ragService.deleteDocument({
        userId: user.id,
        accessToken,
        documentId: id,
    });

    success(res, { deleted: true });
};
