import { createSupabaseClient } from "@/config/supabase";
import { NotFoundError } from "@/utils/errors";
import { logger } from "@/utils/logger";

export interface Mindmap {
  id: string;
  owner_id: string;
  title: string;
  version: number;
  source_document_id: string | null;
  created_at: number; // Unix milliseconds
  updated_at: number; // Unix milliseconds
}

export interface MindmapNode {
  id: string;
  mindmap_id: string;
  text: string;
  position: { x: number; y: number };
  parent_id: string | null;
  children_order: string[];
  data: Record<string, any>;
  notes: string | null;
  collapsed: boolean;
  created_at: number; // Unix milliseconds
  updated_at: number; // Unix milliseconds
}

export interface MindmapWithNodes extends Mindmap {
  nodes: MindmapNode[];
}

type ServiceParams<T = {}> = {
  userId: string;
  accessToken: string;
} & T;

/**
 * Create new mindmap
 */
export const createMindmap = async (
  params: ServiceParams<{
    title: string;
    sourceDocumentId?: string;
  }>
): Promise<Mindmap> => {
  const { userId, accessToken, title, sourceDocumentId } = params;
  const supabase = createSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("mindmaps")
    .insert({
      owner_id: userId,
      title,
      source_document_id: sourceDocumentId || null,
    })
    .select()
    .single();

  if (error || !data) {
    logger.error({ error, userId, title }, "Failed to create mindmap");
    throw new Error("Failed to create mindmap");
  }

  return data;
};

/**
 * List user's mindmaps
 */
export const listMindmaps = async (
  params: ServiceParams<{
    since?: string;
  }>
): Promise<Mindmap[]> => {
  const { userId, accessToken, since } = params;
  const supabase = createSupabaseClient(accessToken);

  let query = supabase
    .from("mindmaps")
    .select("*")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });

  // Support incremental sync - timestamps are now bigint (ms)
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
 * Get mindmap with nodes
 */
export const getMindmap = async (
  params: ServiceParams<{
    mindmapId: string;
  }>
): Promise<MindmapWithNodes> => {
  const { userId, accessToken, mindmapId } = params;
  const supabase = createSupabaseClient(accessToken);

  // Get mindmap
  const { data: mindmap, error: mindmapError } = await supabase
    .from("mindmaps")
    .select("*")
    .eq("id", mindmapId)
    .eq("owner_id", userId)
    .single();

  if (mindmapError || !mindmap) {
    logger.error(
      { error: mindmapError, userId, mindmapId },
      "Mindmap not found"
    );
    throw new NotFoundError("Mindmap not found");
  }

  // Get nodes
  const { data: nodes, error: nodesError } = await supabase
    .from("mindmap_nodes")
    .select("*")
    .eq("mindmap_id", mindmapId);

  if (nodesError) {
    logger.error(
      { error: nodesError, userId, mindmapId },
      "Failed to get mindmap nodes"
    );
    throw new Error("Failed to retrieve mindmap nodes");
  }

  return {
    ...(mindmap as Mindmap),
    nodes: (nodes as MindmapNode[]) || [],
  };
};

/**
 * Update mindmap with conflict detection
 */
export const updateMindmap = async (
  params: ServiceParams<{
    mindmapId: string;
    updates: Partial<Pick<Mindmap, "title" | "version">> & {
      expected_version?: number;
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

  if (fetchError || !current) {
    logger.error({ error: fetchError, userId, mindmapId }, "Mindmap not found");
    throw new NotFoundError("Mindmap not found");
  }

  // Check for version conflict if expected_version is provided
  if (
    updates.expected_version !== undefined &&
    current.version !== updates.expected_version
  ) {
    const error: any = new Error("Version conflict detected");
    error.status = 409;
    error.conflict = {
      local_version: updates.expected_version,
      remote_version: current.version,
      remote_updated_at: current.updated_at,
    };
    throw error;
  }

  // Prepare update data
  const updateData: any = {};
  if (updates.title !== undefined) updateData.title = updates.title;

  // Auto-increment version, updated_at is set by trigger but we can set it explicitly too
  updateData.version = current.version + 1;
  updateData.updated_at = Date.now();

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

  return data;
};

/**
 * Delete mindmap
 */
export const deleteMindmap = async (
  params: ServiceParams<{
    mindmapId: string;
  }>
): Promise<void> => {
  const { userId, accessToken, mindmapId } = params;
  const supabase = createSupabaseClient(accessToken);

  const { error } = await supabase
    .from("mindmaps")
    .delete()
    .eq("id", mindmapId)
    .eq("owner_id", userId);

  if (error) {
    logger.error({ error, userId, mindmapId }, "Failed to delete mindmap");
    throw new Error("Failed to delete mindmap");
  }

  logger.info({ userId, mindmapId }, "Mindmap deleted successfully");

  return;
};
