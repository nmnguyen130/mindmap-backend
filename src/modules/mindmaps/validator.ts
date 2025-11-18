import { z } from 'zod'

export const mindMapCreateSchema = z.object({
  title: z.string().min(1),
})

export const mindMapUpdateSchema = z.object({
  title: z.string().min(1).optional(),
})

export type MindMapCreateInput = z.infer<typeof mindMapCreateSchema>
export type MindMapUpdateInput = z.infer<typeof mindMapUpdateSchema>
