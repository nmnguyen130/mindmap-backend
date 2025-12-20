import { Response } from "express";
import { AuthRequest } from "@/middlewares/auth";
import { success } from "@/utils/response";

import * as mindmapService from "./service";
import { CreateMindmapInput, UpdateMindmapInput } from "./schemas";

// Transform frontend node format to backend format
const transformNodes = (nodes?: CreateMindmapInput["nodes"]) => {
  if (!nodes) return undefined;
  return nodes.map((n) => ({
    id: n.id,
    label: n.label,
    keywords: n.keywords ?? null,
    level: n.level ?? 0,
    parent_id: n.parent_id ?? null,
    position_x: n.position?.x ?? 0,
    position_y: n.position?.y ?? 0,
    notes: n.notes ?? null,
    version: n.version ?? 1,
  }));
};

// Transform frontend connection format to backend format
const transformConnections = (
  connections?: CreateMindmapInput["connections"]
) => {
  if (!connections) return undefined;
  return connections.map((c) => ({
    id: c.id,
    from_node_id: c.from_node_id,
    to_node_id: c.to_node_id,
    relationship: c.relationship ?? null,
    version: c.version ?? 1,
  }));
};

/**
 * POST /api/mindmaps - Create mindmap (with optional nodes/connections for sync)
 */
export const create = async (req: AuthRequest, res: Response) => {
  const { user, accessToken } = req;
  const body = req.body as CreateMindmapInput;

  const mindmap = await mindmapService.createMindmap({
    userId: user.id,
    accessToken,
    id: body.id,
    title: body.title,
    central_topic: body.central_topic,
    summary: body.summary,
    document_id: body.document_id ?? undefined,
    nodes: transformNodes(body.nodes),
    connections: transformConnections(body.connections),
  });

  success(res, mindmap, 201);
};

/**
 * GET /api/mindmaps - List user's mindmaps
 * Supports incremental sync with ?since= query parameter
 */
export const list = async (req: AuthRequest, res: Response) => {
  const { user, accessToken } = req;
  const { since } = req.query;

  const mindmaps = await mindmapService.listMindmaps({
    userId: user.id,
    accessToken,
    since: since ? String(since) : undefined,
  });

  success(res, mindmaps);
};

/**
 * GET /api/mindmaps/:id - Get mindmap with nodes and connections
 */
export const get = async (req: AuthRequest, res: Response) => {
  const { user, accessToken } = req;
  const { id } = req.params;

  if (!id) {
    throw new Error("Mindmap ID is required");
  }

  const mindmap = await mindmapService.getMindmap({
    userId: user.id,
    accessToken,
    mindmapId: id,
  });

  success(res, mindmap);
};

/**
 * PUT /api/mindmaps/:id - Update mindmap (with optional nodes/connections for sync)
 */
export const update = async (req: AuthRequest, res: Response) => {
  const { user, accessToken } = req;
  const { id } = req.params;

  if (!id) {
    throw new Error("Mindmap ID is required");
  }

  const body = req.body as UpdateMindmapInput;

  const mindmap = await mindmapService.updateMindmap({
    userId: user.id,
    accessToken,
    mindmapId: id,
    updates: {
      title: body.title,
      central_topic: body.central_topic,
      summary: body.summary,
      version: body.version,
      expected_version: body.expected_version,
      nodes: transformNodes(body.nodes),
      connections: transformConnections(body.connections),
    },
  });

  success(res, mindmap);
};

/**
 * DELETE /api/mindmaps/:id - Soft delete mindmap
 */
export const remove = async (req: AuthRequest, res: Response) => {
  const { user, accessToken } = req;
  const { id } = req.params;

  if (!id) {
    throw new Error("Mindmap ID is required");
  }

  await mindmapService.deleteMindmap({
    userId: user.id,
    accessToken,
    mindmapId: id,
  });

  success(res, { deleted: true });
};
