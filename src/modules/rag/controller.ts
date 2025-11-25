import { Response } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import * as ragService from './service';
import { success } from '@/utils/response';
import { ChatInput } from './schemas';

/**
 * POST /api/chat
 * Chat with RAG context (streaming)
 */
export const chat = async (req: AuthRequest, res: Response) => {
    const { user, accessToken } = req;
    const body = req.body as ChatInput;

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const stream = ragService.generateChatCompletion({
        userId: user.id,
        accessToken,
        question: body.question,
        conversationId: undefined,
        file_id: body.file_id,
        mindmap_id: body.mindmap_id,
    });

    for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ content: chunk })}\\n\\n`);
    }

    res.write('data: [DONE]\\n\\n');
    res.end();
};

/**
 * POST /api/query
 * Query RAG system without streaming
 */
export const query = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    const { user, accessToken } = req;
    const body = req.body as ChatInput;

    const stream = ragService.generateChatCompletion({
        userId: user.id,
        accessToken,
        question: body.question,
        conversationId: undefined,
        file_id: body.file_id,
        mindmap_id: body.mindmap_id,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
        fullResponse += chunk;
    }

    success(res, { answer: fullResponse });
};

/**
 * GET /api/rag/status
 * Get RAG service status
 */
export const getStatus = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    const { user, accessToken } = req;

    const { data: chunksCount, error } = await req.supabase!
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
};
