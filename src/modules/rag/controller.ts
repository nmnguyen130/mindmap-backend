import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/middlewares/auth';
import * as ragService from './service';
import { success } from '@/utils/response';
import { logger } from '@/utils/logger';
import { IngestInput, ChatInput } from './schemas';

/**
 * POST /api/ingest
 * Ingest document (text or PDF)
 */
export const ingest = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const body = req.body as IngestInput;

        let fileBuffer: Buffer | undefined;
        let fileName: string | undefined;

        // Check if file was uploaded
        if (req.file) {
            fileBuffer = req.file.buffer;
            fileName = req.file.originalname;
        }

        const result = await ragService.ingestDocument({
            userId,
            text: body.text,
            fileBuffer,
            fileName,
            mindmapId: body.mindmap_id,
        });

        success(res, result, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/chat
 * Chat with RAG context (streaming or non-streaming)
 */
export const chat = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const body = req.body as ChatInput;

        if (body.stream) {
            // Set headers for SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const stream = ragService.generateChatCompletion(
                body.question,
                userId,
                body.conversation_id
            );

            for await (const chunk of stream) {
                res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            }

            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            // Non-streaming response
            const stream = ragService.generateChatCompletion(
                body.question,
                userId,
                body.conversation_id
            );

            let fullResponse = '';
            for await (const chunk of stream) {
                fullResponse += chunk;
            }

            success(res, { answer: fullResponse });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/query (alias for chat with non-streaming default)
 */
export const query = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const body = req.body as ChatInput;

        const stream = ragService.generateChatCompletion(
            body.question,
            userId,
            body.conversation_id
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
