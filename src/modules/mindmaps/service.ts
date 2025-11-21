import { supabaseAdmin } from '@/config/supabase';
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

/**
 * Create new mindmap
 */
export const createMindmap = async (
    userId: string,
    title: string,
    sourceFileId?: string
): Promise<Mindmap> => {
    const { data, error } = await supabaseAdmin
        .from('mindmaps')
        .insert({
            owner_id: userId,
            title,
            source_file_id: sourceFileId || null,
        })
        .select()
        .single();

    if (error || !data) {
        logger.error({ error }, 'Failed to create mindmap');
        throw new Error('Failed to create mindmap');
    }

    return data as Mindmap;
};

/**
 * List user's mindmaps
 */
export const listMindmaps = async (userId: string): Promise<Mindmap[]> => {
    const { data, error } = await supabaseAdmin
        .from('mindmaps')
        .select('*')
        .eq('owner_id', userId)
        .order('updated_at', { ascending: false });

    if (error) {
        logger.error({ error }, 'Failed to list mindmaps');
        throw new Error('Failed to list mindmaps');
    }

    return (data as Mindmap[]) || [];
};

/**
 * Get mindmap with nodes
 */
export const getMindmap = async (
    mindmapId: string,
    userId: string
): Promise<MindmapWithNodes> => {
    // Get mindmap
    const { data: mindmap, error: mindmapError } = await supabaseAdmin
        .from('mindmaps')
        .select('*')
        .eq('id', mindmapId)
        .eq('owner_id', userId)
        .single();

    if (mindmapError || !mindmap) {
        throw new NotFoundError('Mindmap not found');
    }

    // Get nodes
    const { data: nodes, error: nodesError } = await supabaseAdmin
        .from('mindmap_nodes')
        .select('*')
        .eq('mindmap_id', mindmapId)
        .order('created_at', { ascending: true });

    if (nodesError) {
        logger.error({ nodesError }, 'Failed to get mindmap nodes');
        throw new Error('Failed to retrieve mindmap nodes');
    }

    return {
        ...mindmap,
        nodes: (nodes as MindmapNode[]) || [],
    } as MindmapWithNodes;
};

/**
 * Update mindmap
 */
export const updateMindmap = async (
    mindmapId: string,
    userId: string,
    updates: Partial<{ title: string; version: number }>
): Promise<Mindmap> => {
    const { data, error } = await supabaseAdmin
        .from('mindmaps')
        .update(updates)
        .eq('id', mindmapId)
        .eq('owner_id', userId)
        .select()
        .single();

    if (error || !data) {
        throw new NotFoundError('Mindmap not found');
    }

    return data as Mindmap;
};

/**
 * Delete mindmap
 */
export const deleteMindmap = async (
    mindmapId: string,
    userId: string
): Promise<void> => {
    const { error } = await supabaseAdmin
        .from('mindmaps')
        .delete()
        .eq('id', mindmapId)
        .eq('owner_id', userId);

    if (error) {
        logger.error({ error }, 'Failed to delete mindmap');
        throw new Error('Failed to delete mindmap');
    }
};
