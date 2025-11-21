import { z } from 'zod';

export const createConversationSchema = z.object({
    title: z.string().optional(),
    context_mode: z.enum(['rag', 'normal'], {
        error: 'Context mode must be either "rag" or "normal"'
    }).default('rag'),
});

export const updateConversationSchema = z.object({
    title: z.string().min(1, { error: 'Title cannot be empty' }),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
