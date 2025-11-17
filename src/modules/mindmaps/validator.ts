import { z } from 'zod'

export const positionSchema = z.object({ x: z.number(), y: z.number() })
export const nodeSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  position: positionSchema,
  connections: z.array(z.string()),
  notes: z.string().optional(),
})

export const mindMapCreateSchema = z.object({
  title: z.string().min(1),
  nodes: z.array(nodeSchema).default([]),
})

export const mindMapUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  nodes: z.array(nodeSchema).optional(),
  version: z.number().int().nonnegative(),
})

export type MindMapCreateInput = z.infer<typeof mindMapCreateSchema>
export type MindMapUpdateInput = z.infer<typeof mindMapUpdateSchema>
