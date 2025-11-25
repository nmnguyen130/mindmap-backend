import { createSupabaseClient } from '@/config/supabase';
import { NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export interface Mindmap {
    id: string;
    owner_id: string;
    title: string;
    version: number;
    source_file_id: string | null;
    created_at: string;
    updated_at: string;
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
    created_at: string;
    updated_at: string;
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
export const createMindmap = async (params: ServiceParams<{
    title: string;
    sourceFileId?: string;
}>): Promise<Mindmap> => {
    const { userId, accessToken, title, sourceFileId } = params;
    const supabase = createSupabaseClient(accessToken);

    const { data, error } = await supabase
        .from('mindmaps')
        .insert({
            owner_id: userId,
            title,
            source_file_id: sourceFileId || null,
        })
        .select()
        .single();

    if (error || !data) {
        logger.error({ error, userId, title }, 'Failed to create mindmap');
        throw new Error('Failed to create mindmap');
    }

    return data;
};

/**
 * List user's mindmaps
 */
export const listMindmaps = async (params: ServiceParams): Promise<Mindmap[]> => {
    const { userId, accessToken } = params;
    const supabase = createSupabaseClient(accessToken);

    const { data, error } = await supabase
        .from('mindmaps')
        .select('*')
        .eq('owner_id', userId)
        .order('updated_at', { ascending: false });

    if (error) {
        logger.error({ error, userId }, 'Failed to list mindmaps');
        throw new Error('Failed to list mindmaps');
    }

    return data || [];
};

/**
 * Get mindmap with nodes
 */
export const getMindmap = async (params: ServiceParams<{
    mindmapId: string;
}>): Promise<MindmapWithNodes> => {
    const { userId, accessToken, mindmapId } = params;
    const supabase = createSupabaseClient(accessToken);

    // Get mindmap
    const { data: mindmap, error: mindmapError } = await supabase
        .from('mindmaps')
        .select('*')
        .eq('id', mindmapId)
        .eq('owner_id', userId)
        .single();

    if (mindmapError || !mindmap) {
        logger.error({ error: mindmapError, userId, mindmapId }, 'Mindmap not found');
        throw new NotFoundError('Mindmap not found');
    }

    // Get nodes
    const { data: nodes, error: nodesError } = await supabase
        .from('mindmap_nodes')
        .select('*')
        .eq('mindmap_id', mindmapId);

    if (nodesError) {
        logger.error({ error: nodesError, userId, mindmapId }, 'Failed to get mindmap nodes');
        throw new Error('Failed to retrieve mindmap nodes');
    }

    return {
        ...(mindmap as Mindmap),
        nodes: (nodes as MindmapNode[]) || [],
    };
};

/**
 * Update mindmap
 */
export const updateMindmap = async (params: ServiceParams<{
    mindmapId: string;
    updates: Partial<Pick<Mindmap, 'title' | 'version'>>;
}>): Promise<Mindmap> => {
    const { userId, accessToken, mindmapId, updates } = params;
    const supabase = createSupabaseClient(accessToken);

    const { data, error } = await supabase
        .from('mindmaps')
        .update(updates)
        .eq('id', mindmapId)
        .eq('owner_id', userId)
        .select()
        .single();

    if (error || !data) {
        logger.error({ error, userId, mindmapId }, 'Mindmap update failed - not found');
        throw new NotFoundError('Mindmap update failed - not found');
    }

    return data;
};

/**
 * Delete mindmap
 */
export const deleteMindmap = async (params: ServiceParams<{
    mindmapId: string;
}>): Promise<void> => {
    const { userId, accessToken, mindmapId } = params;
    const supabase = createSupabaseClient(accessToken);

    const { error } = await supabase
        .from('mindmaps')
        .delete()
        .eq('id', mindmapId)
        .eq('owner_id', userId);

    if (error) {
        logger.error({ error, userId, mindmapId }, 'Failed to delete mindmap');
        throw new Error('Failed to delete mindmap');
    }

    logger.info({ userId, mindmapId }, 'Mindmap deleted successfully');

    return;
};
