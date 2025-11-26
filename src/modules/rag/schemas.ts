import { z } from 'zod';

// Schema for processing a document (splitting and embedding)
export const processDocumentSchema = z.object({
    document_id: z.uuid({ message: 'Invalid document ID format' }),
});

// Schema for RAG chat query
export const ragChatSchema = z.object({
    question: z.string().min(1, { message: 'Question cannot be empty' }),
    document_id: z.uuid({ message: 'Invalid document ID format' }).optional(),
    match_threshold: z.number().min(0).max(1).default(0.8),
    match_count: z.number().int().min(1).max(20).default(5),
});

export type ProcessDocumentInput = z.infer<typeof processDocumentSchema>;
export type RagChatInput = z.infer<typeof ragChatSchema>;
