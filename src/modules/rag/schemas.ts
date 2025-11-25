import { z } from 'zod';

export const chatSchema = z.object({
    question: z.string().min(1, 'Question is required'),
    file_id: z.uuid('Invalid file ID').optional(),
    mindmap_id: z.uuid('Invalid mindmap ID').optional(),
    stream: z.boolean().default(true),
    top_k: z.number().int().positive().max(20).default(5).optional(),
});

export type ChatInput = z.infer<typeof chatSchema>;
