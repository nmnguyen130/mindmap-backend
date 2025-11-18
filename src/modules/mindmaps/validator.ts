import { z } from 'zod'

export const positionSchema = z.object({ x: z.number(), y: z.number() })

export const nodeSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  position: positionSchema,
  notes: z.string().optional(),
  data: z.any().optional(),
  parent_id: z.string().nullable().optional(),
  children_order: z.array(z.string()).optional(),
  collapsed: z.boolean().optional(),
})

export const nodeCreateSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  position: positionSchema,
})

export const nodeUpdateSchema = z.object({
  text: z.string().min(1).optional(),
  position: positionSchema.optional(),
  notes: z.string().optional(),
  data: z.any().optional(),
  parent_id: z.string().nullable().optional(),
  children_order: z.array(z.string()).optional(),
  collapsed: z.boolean().optional(),
})

export const mindMapCreateSchema = z.object({
  title: z.string().min(1),
  nodes: z.array(nodeSchema).default([]),
})

export const mindMapUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  version: z.number().int().nonnegative().optional(),
  nodes: z.array(nodeSchema).optional(),
})

export type NodeInput = z.infer<typeof nodeSchema>
export type NodeCreateInput = z.infer<typeof nodeCreateSchema>
export type NodeUpdateInput = z.infer<typeof nodeUpdateSchema>
export type MindMapCreateInput = z.infer<typeof mindMapCreateSchema>
export type MindMapUpdateInput = z.infer<typeof mindMapUpdateSchema>
