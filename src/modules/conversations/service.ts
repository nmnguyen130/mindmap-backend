import { createSupabaseClient } from '@/config/supabase';
import { NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export interface Conversation {
    id: string;
    user_id: string;
    title: string | null;
    context_mode: string;
    metadata: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export interface Message {
    id: string;
    conversation_id: string;
    role: string;
    content: string;
    metadata: Record<string, any>;
    created_at: string;
}

export interface ConversationWithMessages extends Conversation {
    messages: Message[];
}

type ServiceParams<T = {}> = {
    userId: string;
    accessToken: string;
} & T;

/**
 * Create a new conversation
 */
export const createConversation = async (params: ServiceParams<{
    title?: string;
    contextMode: 'rag' | 'normal'
}>): Promise<Conversation> => {
    const { userId, accessToken, title, contextMode } = params;
    const supabase = createSupabaseClient(accessToken);

    const { data, error } = await supabase
        .from('conversations')
        .insert({
            user_id: userId,
            title,
            context_mode: contextMode,
        })
        .select()
        .single();

    if (error || !data) {
        logger.error({ error, userId, title }, 'Failed to create conversation');
        throw new Error('Failed to create conversation');
    }

    return data;
};

/**
 * List user conversations
 */
export const listConversations = async (params: ServiceParams): Promise<Conversation[]> => {
    const { userId, accessToken } = params;
    const supabase = createSupabaseClient(accessToken);

    const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

    if (error) {
        logger.error({ error, userId }, 'Failed to list conversations');
        throw new Error('Failed to list conversations');
    }

    return data || [];
};

/**
 * Get conversation with messages
 */
export const getConversation = async (params: ServiceParams<{
    conversationId: string
}>): Promise<ConversationWithMessages> => {
    const { userId, accessToken, conversationId } = params;
    const supabase = createSupabaseClient(accessToken);

    // Get conversation
    const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single();

    if (convError || !conversation) {
        logger.error({ convError, userId, conversationId }, 'Conversation not found');
        throw new NotFoundError('Conversation not found');
    }

    // Get messages
    const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId);

    if (msgError) {
        logger.error({ msgError, userId, conversationId }, 'Failed to get messages');
        throw new Error('Failed to retrieve messages');
    }

    return {
        ...conversation,
        messages: (messages as Message[]) || [],
    };
};

/**
 * Update conversation title
 */
export const updateConversation = async (params: ServiceParams<{
    conversationId: string;
    title: string
}>): Promise<Conversation> => {
    const { userId, accessToken, conversationId, title } = params;
    const supabase = createSupabaseClient(accessToken);

    const { data, error } = await supabase
        .from('conversations')
        .update({ title })
        .eq('id', conversationId)
        .eq('user_id', userId)
        .select()
        .single();

    if (error || !data) {
        logger.error({ error, userId, conversationId }, 'Conversation update failed - not found');
        throw new NotFoundError('Conversation update failed - not found');
    }

    return data;
};

/**
 * Delete conversation
 */
export const deleteConversation = async (params: ServiceParams<{
    conversationId: string
}>): Promise<void> => {
    const { userId, accessToken, conversationId } = params;
    const supabase = createSupabaseClient(accessToken);

    const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', userId);

    if (error) {
        logger.error({ error, userId, conversationId }, 'Failed to delete conversation');
        throw new Error('Failed to delete conversation');
    }

    logger.info({ userId, conversationId }, 'Conversation deleted successfully');

    return;
};
