import { createSupabaseClient } from '@/config/supabase';
import { EmbeddingService } from '@/services/embedding.service';
import { openai, OPENAI_CONFIG } from '@/config/openai';
import { NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export interface DocumentSection {
    id: string;
    document_id: string;
    content: string;
    embedding: number[] | null;
    metadata: Record<string, any>;
    created_at: string;
}

export interface Document {
    id: string;
    name: string;
    storage_object_id: string;
    created_by: string;
    created_at: string;
}

type ServiceParams<T = {}> = {
    userId: string;
    accessToken: string;
} & T;

/**
 * Process document: download, split into sections, generate embeddings
 * Based on GitHub reference: supabase/functions/process/index.ts
 */
export const processDocument = async (params: ServiceParams<{
    documentId: string;
}>): Promise<{ sections_created: number }> => {
    const { userId, accessToken, documentId } = params;
    const supabase = createSupabaseClient(accessToken);

    // Get document with storage path
    const { data: document, error: docError } = await supabase
        .from('documents_with_storage_path')
        .select('*')
        .eq('id', documentId)
        .single();

    if (docError || !document) {
        logger.error({ docError, userId, documentId }, 'Document not found');
        throw new NotFoundError('Document not found');
    }

    // Download file from storage
    const { data: file, error: downloadError } = await supabase.storage
        .from('files')
        .download(document.storage_object_path);

    if (downloadError || !file) {
        logger.error({ downloadError, userId, documentId }, 'Failed to download file');
        throw new Error('Failed to download storage object');
    }

    const fileContents = await file.text();

    // Simple markdown-like processing: split by paragraphs
    const sections = splitIntoSections(fileContents);

    logger.info({ documentId, sections: sections.length }, 'Split document into sections');

    // Insert sections (without embeddings initially)
    const { data: insertedSections, error: insertError } = await supabase
        .from('document_sections')
        .insert(
            sections.map(content => ({
                document_id: documentId,
                content,
            }))
        )
        .select();

    if (insertError || !insertedSections) {
        logger.error({ insertError, userId, documentId }, 'Failed to save document sections');
        throw new Error('Failed to save document sections');
    }

    // Generate embeddings asynchronously (background task)
    generateEmbeddings({
        userId,
        accessToken,
        sectionIds: insertedSections.map(s => s.id),
    }).catch(err => {
        logger.error({ err, documentId }, 'Failed to generate embeddings');
    });

    return { sections_created: insertedSections.length };
};

/**
 * Split text into sections (simple paragraph-based)
 */
function splitIntoSections(text: string): string[] {
    // Split by double newlines (paragraphs)
    const paragraphs = text
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

    const maxChunkSize = 1000;
    const sections: string[] = [];
    let currentSection = '';

    for (const paragraph of paragraphs) {
        if (currentSection.length + paragraph.length > maxChunkSize && currentSection.length > 0) {
            sections.push(currentSection);
            currentSection = paragraph;
        } else {
            currentSection += (currentSection ? '\n\n' : '') + paragraph;
        }
    }

    if (currentSection) {
        sections.push(currentSection);
    }

    return sections.length > 0 ? sections : [text];
}

/**
 * Generate embeddings for sections
 * Based on GitHub reference: supabase/functions/embed/index.ts
 */
async function generateEmbeddings(params: ServiceParams<{
    sectionIds: string[];
}>): Promise<void> {
    const { userId, accessToken, sectionIds } = params;
    const supabase = createSupabaseClient(accessToken);

    // Get sections without embeddings
    const { data: sections, error: selectError } = await supabase
        .from('document_sections')
        .select('id, content')
        .in('id', sectionIds)
        .is('embedding', null);

    if (selectError || !sections) {
        logger.error({ selectError, userId }, 'Failed to fetch sections');
        return;
    }

    for (const section of sections) {
        if (!section.content) {
            logger.error({ sectionId: section.id }, 'No content available');
            continue;
        }

        try {
            // Generate embedding
            const embedding = await EmbeddingService.generateEmbedding(section.content);

            // Update section with embedding
            const { error: updateError } = await supabase
                .from('document_sections')
                .update({ embedding })
                .eq('id', section.id);

            if (updateError) {
                logger.error({ updateError, sectionId: section.id }, 'Failed to save embedding');
            } else {
                logger.info({ sectionId: section.id }, 'Generated embedding');
            }
        } catch (err) {
            logger.error({ err, sectionId: section.id }, 'Error generating embedding');
        }
    }
}

/**
 * Chat with RAG context (streaming)
 * Based on GitHub reference: supabase/functions/chat/index.ts
 */
export async function* ragChat(params: ServiceParams<{
    question: string;
    documentId?: string;
    matchThreshold: number;
    matchCount: number;
}>): AsyncGenerator<string, void, unknown> {
    const { userId, accessToken, question, documentId, matchThreshold, matchCount } = params;
    const supabase = createSupabaseClient(accessToken);

    // Generate embedding for the question
    const questionEmbedding = await EmbeddingService.generateEmbedding(question);

    // Search for similar sections using match_document_sections
    const { data, error: matchError } = await supabase
        .rpc('match_document_sections', {
            embedding: questionEmbedding,
            match_threshold: matchThreshold,
            match_count: matchCount,
            filter_document_id: documentId || null,
        })
        .select('content');

    if (matchError) {
        logger.error({ matchError, userId, question }, 'Error matching document sections');
        throw new Error('There was an error reading your documents, please try again.');
    }

    const documents = (data || []) as Array<{ content: string }>;

    // Build context from matched documents
    const injectedDocs = documents.length > 0
        ? documents.map(({ content }) => content).join('\n\n')
        : 'No documents found';

    logger.info({ userId, question, matchedDocs: documents.length }, 'RAG context built');

    // Build messages for OpenAI
    const completionMessages = [
        {
            role: 'user' as const,
            content: `You're an AI assistant who answers questions about documents.

                You're a chat bot, so keep your replies succinct.

                You're only allowed to use the documents below to answer the question.

                If the question isn't related to these documents, say:
                "Sorry, I couldn't find any information on that."

                If the information isn't available in the below documents, say:
                "Sorry, I couldn't find any information on that."

                Do not go off topic.

                Documents:
                ${injectedDocs}
            `,
        },
        {
            role: 'user' as const,
            content: question,
        },
    ];

    // Stream response from OpenAI
    const completionStream = await openai.chat.completions.create({
        model: OPENAI_CONFIG.chatModel,
        messages: completionMessages,
        max_tokens: OPENAI_CONFIG.maxTokens,
        temperature: 0,
        stream: true,
    });

    for await (const chunk of completionStream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
            yield content;
        }
    }
}

/**
 * List user's documents
 */
export const listDocuments = async (params: ServiceParams): Promise<Document[]> => {
    const { userId, accessToken } = params;
    const supabase = createSupabaseClient(accessToken);

    const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false });

    if (error) {
        logger.error({ error, userId }, 'Failed to list documents');
        throw new Error('Failed to list documents');
    }

    return data || [];
};

/**
 * Get document with sections
 */
export const getDocument = async (params: ServiceParams<{
    documentId: string;
}>): Promise<Document & { sections: DocumentSection[] }> => {
    const { userId, accessToken, documentId } = params;
    const supabase = createSupabaseClient(accessToken);

    // Get document
    const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .eq('created_by', userId)
        .single();

    if (docError || !document) {
        logger.error({ docError, userId, documentId }, 'Document not found');
        throw new NotFoundError('Document not found');
    }

    // Get sections
    const { data: sections, error: sectionsError } = await supabase
        .from('document_sections')
        .select('*')
        .eq('document_id', documentId)
        .order('id', { ascending: true });

    if (sectionsError) {
        logger.error({ sectionsError, userId, documentId }, 'Failed to get sections');
        throw new Error('Failed to retrieve sections');
    }

    return {
        ...document,
        sections: (sections as DocumentSection[]) || [],
    };
};

/**
 * Delete document (cascades to sections)
 */
export const deleteDocument = async (params: ServiceParams<{
    documentId: string;
}>): Promise<void> => {
    const { userId, accessToken, documentId } = params;
    const supabase = createSupabaseClient(accessToken);

    const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId)
        .eq('created_by', userId);

    if (error) {
        logger.error({ error, userId, documentId }, 'Failed to delete document');
        throw new Error('Failed to delete document');
    }

    logger.info({ userId, documentId }, 'Document deleted successfully');
};
