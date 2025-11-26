import { z } from 'zod';

export const createMindmapSchema = z.object({
    title: z.string()
        .min(1, { error: 'Title is required' })
        .max(255, { error: 'Title must not exceed 255 characters' }),
    source_document_id: z.uuid({ message: 'Invalid source document ID' }).optional(),
});

export const updateMindmapSchema = z.object({
    title: z.string()
        .min(1, { error: 'Title cannot be empty' })
        .max(255, { error: 'Title must not exceed 255 characters' })
        .optional(),
    version: z.number()
        .int({ error: 'Version must be an integer' })
        .positive({ error: 'Version must be positive' })
        .optional(),
});

export type CreateMindmapInput = z.infer<typeof createMindmapSchema>;
export type UpdateMindmapInput = z.infer<typeof updateMindmapSchema>;
