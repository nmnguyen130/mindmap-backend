import { z } from 'zod';

// Schema for uploading PDF (file validation handled by multer)
export const createFromPdfSchema = z.object({
    title: z.string().optional(),
    generateMindmap: z.boolean().optional().default(false),
});

// Schema for RAG chat query
export const ragChatSchema = z.object({
    question: z.string().min(1, { message: 'Question cannot be empty' }),
    document_id: z.uuid({ message: 'Invalid document ID format' }).optional(),
    match_threshold: z.number().min(0).max(1).default(0.78),
    match_count: z.number().int().min(1).max(20).default(5),
});

export type CreateFromPdfInput = z.infer<typeof createFromPdfSchema>;
export type RagChatInput = z.infer<typeof ragChatSchema>;
