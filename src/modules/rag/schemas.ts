import { z } from 'zod';

export const ingestSchema = z.object({
    text: z.string().min(1, { error: 'Text content is required' }).optional(),
    mindmap_id: z.uuid({ error: 'Invalid mindmap ID format' }).optional(),
});

export const chatSchema = z.object({
    question: z.string().min(1, { error: 'Question is required' }),
    conversation_id: z.uuid({ error: 'Invalid conversation ID format' }).optional(),
    stream: z.boolean().default(true),
    max_tokens: z.number()
        .int({ error: 'Max tokens must be an integer' })
        .positive({ error: 'Max tokens must be positive' })
        .max(4000, { error: 'Max tokens cannot exceed 4000' })
        .optional(),
});

export type IngestInput = z.infer<typeof ingestSchema>;
export type ChatInput = z.infer<typeof chatSchema>;
