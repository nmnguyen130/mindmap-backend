import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import { supabaseAdmin } from '@/config/supabase';
import * as ragService from './service';
import { success } from '@/utils/response';
import { ChatInput } from './schemas';

/**
 * POST /api/chat
 * Chat with RAG context (streaming)
 */
export const chat = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const body = req.body as ChatInput;
        const userId = req.user!.id;

        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const stream = ragService.generateChatCompletion(
            body.question,
            userId,
            undefined,
            body.file_id,
            body.mindmap_id
        );

        for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/query
 * Query RAG system without streaming
 */
export const query = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const body = req.body as ChatInput;
        const userId = req.user!.id;

        const stream = ragService.generateChatCompletion(
            body.question,
            userId,
            undefined,
            body.file_id,
            body.mindmap_id
        );

        let fullResponse = '';
        for await (const chunk of stream) {
            fullResponse += chunk;
        }

        success(res, { answer: fullResponse });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/rag/status
 * Get RAG service status
 */
export const getStatus = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { data: chunksCount, error } = await supabaseAdmin
            .from('document_chunks')
            .select('*', { count: 'exact', head: true });

        const status = {
            status: 'ready',
            vectorStore: 'Supabase pgvector',
            totalChunks: chunksCount || 0,
            embeddingModel: 'Xenova/all-MiniLM-L6-v2',
            chunkingMethod: 'sentence-based'
        };

        success(res, status);
    } catch (error) {
        next(error);
    }
};
