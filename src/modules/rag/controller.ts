import { Response } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import * as ragService from './service';
import { success } from '@/utils/response';
import { RagChatInput } from './schemas';
import { ValidationError } from '@/utils/errors';

/**
 * POST /api/rag/create-from-pdf
 * Upload PDF, create document, and generate embeddings
 * Optionally generate mindmap if generateMindmap=true
 */
export const createFromPdf = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;

    // Check if file was uploaded
    if (!req.file) {
        throw new ValidationError('PDF file is required');
    }

    // Get optional parameters from body
    const title = req.body.title;
    const generateMindmap = req.body.generateMindmap === 'true' || req.body.generateMindmap === true;

    const result = await ragService.createDocumentFromPdf({
        userId: user.id,
        accessToken,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        title,
        generateMindmap,
    });

    success(res, result, 201);
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
