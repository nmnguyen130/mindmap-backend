import { createSupabaseClient } from "@/config/supabase";
import { NotFoundError } from "@/utils/errors";
import { logger } from "@/utils/logger";

import type { SupabaseClient } from "@supabase/supabase-js";

// TYPES
export interface Mindmap {
  id: string;
  owner_id: string;
  title: string;
  central_topic: string | null;
  summary: string | null;
  document_id: string | null;
  version: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface MindmapNode {
  id: string;
  mindmap_id: string;
  label: string;
  keywords: string[] | null;
  level: number;
  parent_id: string | null;
  position_x: number;
  position_y: number;
  notes: string | null;
  version: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface Connection {
  id: string;
  mindmap_id: string;
  from_node_id: string;
  to_node_id: string;
  relationship: string | null;
  version: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface MindmapWithNodes extends Mindmap {
  nodes: MindmapNode[];
  connections: Connection[];
}

export interface NodeInput {
  id: string;
  label: string;
  keywords: string[] | null;
  level: number;
  parent_id: string | null;
  position_x: number;
  position_y: number;
  notes: string | null;
  version?: number;
}

export interface ConnectionInput {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relationship: string | null;
  version?: number;
}

type ServiceParams<T = {}> = {
  userId: string;
  accessToken: string;
} & T;

// HELPER FUNCTIONS

/**
 * Batch upsert nodes for a mindmap
 */
const upsertNodes = async (
  supabase: SupabaseClient,
  mindmapId: string,
  nodes: NodeInput[]
): Promise<void> => {
  if (!nodes || nodes.length === 0) return;

  const nodeRows = nodes.map((n) => ({
    id: n.id,
    mindmap_id: mindmapId,
    label: n.label,
    keywords: n.keywords,
    level: n.level,
    parent_id: n.parent_id,
    position_x: n.position_x,
    position_y: n.position_y,
    notes: n.notes,
    version: n.version || 1,
    updated_at: Date.now(),
  }));

  const { error } = await supabase
    .from("mindmap_nodes")
    .upsert(nodeRows, { onConflict: "id" });

  if (error) {
    logger.error({ error, mindmapId }, "Failed to upsert nodes");
  }
};

/**
 * Batch upsert connections for a mindmap
 */
const upsertConnections = async (
  supabase: SupabaseClient,
  mindmapId: string,
  connections: ConnectionInput[]
): Promise<void> => {
  if (!connections || connections.length === 0) return;

  const connRows = connections.map((c) => ({
    id: c.id,
    mindmap_id: mindmapId,
    from_node_id: c.from_node_id,
    to_node_id: c.to_node_id,
    relationship: c.relationship,
    version: c.version || 1,
    updated_at: Date.now(),
  }));

  const { error } = await supabase
    .from("connections")
    .upsert(connRows, { onConflict: "id" });

  if (error) {
    logger.error({ error, mindmapId }, "Failed to upsert connections");
  }
};

/**
 * Batch insert nodes (for create - no upsert)
 */
const insertNodes = async (
  supabase: SupabaseClient,
  mindmapId: string,
  nodes: NodeInput[]
): Promise<void> => {
  if (!nodes || nodes.length === 0) return;

  const nodeRows = nodes.map((n) => ({
    id: n.id,
    mindmap_id: mindmapId,
    label: n.label,
    keywords: n.keywords,
    level: n.level,
    parent_id: n.parent_id,
    position_x: n.position_x,
    position_y: n.position_y,
    notes: n.notes,
    version: n.version || 1,
  }));

  const { error } = await supabase.from("mindmap_nodes").insert(nodeRows);

  if (error) {
    logger.error({ error, mindmapId }, "Failed to insert nodes");
  }
};

/**
 * Batch insert connections (for create - no upsert)
 */
const insertConnections = async (
  supabase: SupabaseClient,
  mindmapId: string,
  connections: ConnectionInput[]
): Promise<void> => {
  if (!connections || connections.length === 0) return;

  const connRows = connections.map((c) => ({
    id: c.id,
    mindmap_id: mindmapId,
    from_node_id: c.from_node_id,
    to_node_id: c.to_node_id,
    relationship: c.relationship,
    version: c.version || 1,
  }));

  const { error } = await supabase.from("connections").insert(connRows);

  if (error) {
    logger.error({ error, mindmapId }, "Failed to insert connections");
  }
};

/**
 * Create new mindmap with optional nodes and connections (INSERT only)
 */
export const createMindmap = async (
  params: ServiceParams<{
    id?: string;
    title: string;
    central_topic?: string;
    summary?: string;
    document_id?: string;
    nodes?: NodeInput[];
    connections?: ConnectionInput[];
  }>
): Promise<Mindmap> => {
  const {
    userId,
    accessToken,
    id,
    title,
    central_topic,
    summary,
    document_id,
    nodes,
    connections,
  } = params;
  const supabase = createSupabaseClient(accessToken);
  const mindmapId = id || crypto.randomUUID();

  const { data, error } = await supabase
    .from("mindmaps")
    .insert({
      id: mindmapId,
      owner_id: userId,
      title,
      central_topic: central_topic || null,
      summary: summary || null,
      document_id: document_id || null,
    })
    .select()
    .single();

  if (error || !data) {
    logger.error({ error, userId, title }, "Failed to create mindmap");
    throw new Error("Failed to create mindmap");
  }

  // Insert nodes and connections using helpers
  await insertNodes(supabase, mindmapId, nodes || []);
  await insertConnections(supabase, mindmapId, connections || []);

  return data;
};

/**
 * List user's mindmaps (excludes soft-deleted)
 */
export const listMindmaps = async (
  params: ServiceParams<{ since?: string }>
): Promise<Mindmap[]> => {
  const { userId, accessToken, since } = params;
  const supabase = createSupabaseClient(accessToken);

  let query = supabase
    .from("mindmaps")
    .select("*")
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (since) {
    const sinceMs = parseInt(since, 10);
    if (!isNaN(sinceMs) && sinceMs > 0) {
      query = query.gt("updated_at", sinceMs);
    }
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ error, userId }, "Failed to list mindmaps");
    throw new Error("Failed to list mindmaps");
  }

  return data || [];
};

/**
 * Get mindmap with nodes and connections
 */
export const getMindmap = async (
  params: ServiceParams<{ mindmapId: string }>
): Promise<MindmapWithNodes> => {
  const { userId, accessToken, mindmapId } = params;
  const supabase = createSupabaseClient(accessToken);

  const { data: mindmap, error: mindmapError } = await supabase
    .from("mindmaps")
    .select("*")
    .eq("id", mindmapId)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .single();

  if (mindmapError || !mindmap) {
    logger.error(
      { error: mindmapError, userId, mindmapId },
      "Mindmap not found"
    );
    throw new NotFoundError("Mindmap not found");
  }

  const { data: nodes, error: nodesError } = await supabase
    .from("mindmap_nodes")
    .select("*")
    .eq("mindmap_id", mindmapId)
    .is("deleted_at", null);

  if (nodesError) {
    logger.error(
      { error: nodesError, userId, mindmapId },
      "Failed to get nodes"
    );
    throw new Error("Failed to retrieve mindmap nodes");
  }

  const { data: connections, error: connError } = await supabase
    .from("connections")
    .select("*")
    .eq("mindmap_id", mindmapId)
    .is("deleted_at", null);

  if (connError) {
    logger.error(
      { error: connError, userId, mindmapId },
      "Failed to get connections"
    );
    throw new Error("Failed to retrieve connections");
  }

  return {
    ...(mindmap as Mindmap),
    nodes: (nodes as MindmapNode[]) || [],
    connections: (connections as Connection[]) || [],
  };
};

/**
 * Update mindmap with conflict detection (upserts if not found)
 */
export const updateMindmap = async (
  params: ServiceParams<{
    mindmapId: string;
    updates: Partial<
      Pick<Mindmap, "title" | "central_topic" | "summary" | "version">
    > & {
      expected_version?: number;
      nodes?: NodeInput[];
      connections?: ConnectionInput[];
    };
  }>
): Promise<Mindmap> => {
  const { userId, accessToken, mindmapId, updates } = params;
  const supabase = createSupabaseClient(accessToken);

  // Get current version for conflict detection
  const { data: current, error: fetchError } = await supabase
    .from("mindmaps")
    .select("version, updated_at")
    .eq("id", mindmapId)
    .eq("owner_id", userId)
    .single();

  // If mindmap not found, upsert it (handles new records from frontend)
  if (fetchError?.code === "PGRST116" || !current) {
    logger.info({ userId, mindmapId }, "Mindmap not found, upserting");

    const { data: upserted, error: upsertError } = await supabase
      .from("mindmaps")
      .upsert(
        {
          id: mindmapId,
          owner_id: userId,
          title: updates.title || "Untitled",
          central_topic: updates.central_topic || null,
          summary: updates.summary || null,
          version: 1,
          updated_at: Date.now(),
        },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (upsertError || !upserted) {
      logger.error(
        { error: upsertError, userId, mindmapId },
        "Failed to upsert mindmap"
      );
      throw new Error("Failed to upsert mindmap");
    }

    // Upsert nodes and connections using helpers
    await upsertNodes(supabase, mindmapId, updates.nodes || []);
    await upsertConnections(supabase, mindmapId, updates.connections || []);

    return upserted;
  }

  if (fetchError) {
    logger.error(
      { error: fetchError, userId, mindmapId },
      "Failed to fetch mindmap"
    );
    throw new Error("Failed to fetch mindmap");
  }

  // Check for version conflict
  if (
    updates.expected_version !== undefined &&
    current.version !== updates.expected_version
  ) {
    const error: Error & { status?: number; conflict?: object } = new Error(
      "Version conflict detected"
    );
    error.status = 409;
    error.conflict = {
      local_version: updates.expected_version,
      remote_version: current.version,
      remote_updated_at: current.updated_at,
    };
    throw error;
  }

  // Prepare update data
  const updateData: Record<string, unknown> = { updated_at: Date.now() };
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.central_topic !== undefined)
    updateData.central_topic = updates.central_topic;
  if (updates.summary !== undefined) updateData.summary = updates.summary;
  updateData.version = current.version + 1;

  const { data, error } = await supabase
    .from("mindmaps")
    .update(updateData)
    .eq("id", mindmapId)
    .eq("owner_id", userId)
    .select()
    .single();

  if (error || !data) {
    logger.error({ error, userId, mindmapId }, "Mindmap update failed");
    throw new Error("Mindmap update failed");
  }

  // Upsert nodes and connections using helpers
  await upsertNodes(supabase, mindmapId, updates.nodes || []);
  await upsertConnections(supabase, mindmapId, updates.connections || []);

  return data;
};

/**
 * Delete mindmap (soft delete)
 */
export const deleteMindmap = async (
  params: ServiceParams<{ mindmapId: string }>
): Promise<void> => {
  const { userId, accessToken, mindmapId } = params;
  const supabase = createSupabaseClient(accessToken);
  const now = Date.now();

  const { error } = await supabase
    .from("mindmaps")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", mindmapId)
    .eq("owner_id", userId);

  if (error) {
    logger.error({ error, userId, mindmapId }, "Failed to delete mindmap");
    throw new Error("Failed to delete mindmap");
  }

  // Soft delete nodes and connections
  await supabase
    .from("mindmap_nodes")
    .update({ deleted_at: now, updated_at: now })
    .eq("mindmap_id", mindmapId);

  await supabase
    .from("connections")
    .update({ deleted_at: now, updated_at: now })
    .eq("mindmap_id", mindmapId);

  logger.info({ userId, mindmapId }, "Mindmap soft deleted");
};
