import { z } from "zod";

// Node schema for sync
const nodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  keywords: z.array(z.string()).optional(),
  level: z.number().int().min(0).optional(),
  parent_id: z.string().nullable().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  notes: z.string().nullable().optional(),
  version: z.number().int().optional(),
});

// Connection schema for sync
const connectionSchema = z.object({
  id: z.string(),
  from_node_id: z.string(),
  to_node_id: z.string(),
  relationship: z.string().nullable().optional(),
  version: z.number().int().optional(),
});

// CREATE: Full mindmap with nodes/connections (for sync)
export const createMindmapSchema = z.object({
  id: z.string().optional(), // Client-generated ID for sync
  title: z
    .string()
    .min(1, { error: "Title is required" })
    .max(255, { error: "Title must not exceed 255 characters" }),
  central_topic: z.string().max(500).optional(),
  summary: z.string().max(2000).optional(),
  document_id: z.string().nullable().optional(),
  version: z.number().int().positive().optional(),
  nodes: z.array(nodeSchema).optional(),
  connections: z.array(connectionSchema).optional(),
});

// UPDATE: Partial update with nodes/connections
export const updateMindmapSchema = z.object({
  title: z
    .string()
    .min(1, { error: "Title cannot be empty" })
    .max(255, { error: "Title must not exceed 255 characters" })
    .optional(),
  central_topic: z.string().max(500).optional(),
  summary: z.string().max(2000).optional(),
  version: z
    .number()
    .int({ error: "Version must be an integer" })
    .positive({ error: "Version must be positive" })
    .optional(),
  expected_version: z.number().int().optional(), // For conflict detection
  nodes: z.array(nodeSchema).optional(),
  connections: z.array(connectionSchema).optional(),
});

export type CreateMindmapInput = z.infer<typeof createMindmapSchema>;
export type UpdateMindmapInput = z.infer<typeof updateMindmapSchema>;
