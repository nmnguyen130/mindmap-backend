import pdfParse from 'pdf-parse-new';
import { createSupabaseClient } from '@/config/supabase';
import { EmbeddingService } from '@/services/embedding.service';
import * as storageService from '@/services/storage.service';
import { openai, OPENAI_CONFIG } from '@/config/openai';
import { NotFoundError, ValidationError } from '@/utils/errors';
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
 * Create document from PDF - Complete workflow
 * Upload PDF → Create document → Process and generate embeddings → Optionally generate mindmap
 * Based on GitHub reference: chatgpt-your-files
 */
export const createDocumentFromPdf = async (params: ServiceParams<{
    fileBuffer: Buffer;
    fileName: string;
    title?: string;
    generateMindmap?: boolean;
}>): Promise<{
    id: string;
    name: string;
    storage_object_id: string;
    sections_created: number;
    created_at: string;
    mindmap?: {
        id: string;
        title: string;
        mindmap_data: any;
        nodes_count: number;
    };
}> => {
    const { userId, accessToken, fileBuffer, fileName, title, generateMindmap = false } = params;
    const supabase = createSupabaseClient(accessToken);

    // Validate file type
    if (!fileName.toLowerCase().endsWith('.pdf')) {
        throw new ValidationError('Only PDF files are supported');
    }

    try {
        logger.info({ userId, fileName, generateMindmap }, 'Processing PDF upload');

        // Step 1: Parse PDF to extract text
        const pdfData = await pdfParse(fileBuffer);
        const text = pdfData.text.trim();

        if (!text) {
            throw new ValidationError('PDF contains no extractable text');
        }

        // Step 2: Upload file to Supabase Storage
        const { id: storageId, path: storagePath, file_size: fileSize } = await storageService.uploadFile(userId, fileBuffer, fileName, 'application/pdf');

        // Step 3: Create document record
        const documentName = title || fileName;
        const { data: document, error: docError } = await supabase
            .from('documents')
            .insert({
                name: documentName,
                storage_object_id: storageId,
                created_by: userId,
            })
            .select()
            .single();

        if (docError || !document) {
            logger.error({ docError, userId }, 'Failed to create document record');
            throw new Error(`Failed to create document: ${docError?.message}`);
        }

        // Step 4: Split text into sections
        const sections = splitIntoSections(text);
        logger.info({ documentId: document.id, sectionCount: sections.length }, 'Text split into sections');

        // Step 5: Insert document sections
        const { data: insertedSections, error: sectionsError } = await supabase
            .from('document_sections')
            .insert(
                sections.map((content, index) => ({
                    document_id: document.id,
                    content,
                    metadata: {
                        source: fileName,
                        page_count: pdfData.numpages,
                        section_index: index,
                    },
                }))
            )
            .select('id');

        if (sectionsError || !insertedSections) {
            logger.error({ sectionsError, documentId: document.id }, 'Failed to insert sections');
            throw new Error(`Failed to create document sections: ${sectionsError?.message}`);
        }

        // Step 6: Generate embeddings asynchronously (background task)
        generateEmbeddings({
            userId,
            accessToken,
            sectionIds: insertedSections.map(s => s.id),
        }).catch(err => {
            logger.error({ err, documentId: document.id }, 'Failed to generate embeddings');
        });

        const result: any = {
            id: document.id,
            name: document.name,
            storage_object_id: document.storage_object_id,
            sections_created: insertedSections.length,
            created_at: document.created_at,
        };

        // Step 7 (Optional): Generate mindmap structure using LLM
        if (generateMindmap) {
            // Import llmService lazily to avoid circular dependencies
            const { llmService } = await import('@/services/llm.service');

            const mindmapData = await llmService.analyzePdfForMindmap(text, fileName);
            logger.info({ nodes: mindmapData.nodes.length }, 'Mindmap structure generated');

            // Step 8: Create mindmap record
            const { data: mindmap, error: mindmapError } = await supabase
                .from('mindmaps')
                .insert({
                    owner_id: userId,
                    title: title || mindmapData.title,
                    source_document_id: document.id,
                    mindmap_data: mindmapData,
                })
                .select()
                .single();

            if (mindmapError || !mindmap) {
                logger.error({ mindmapError }, 'Failed to create mindmap');
                throw new Error(`Failed to create mindmap: ${mindmapError?.message}`);
            }

            logger.info({ mindmapId: mindmap.id, documentId: document.id }, 'Mindmap created successfully');

            result.mindmap = {
                id: mindmap.id,
                title: mindmap.title,
                mindmap_data: mindmapData,
                nodes_count: mindmapData.nodes.length,
            };
        }

        return result;
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }
        logger.error({ error, userId, fileName }, 'PDF upload workflow failed');
        throw new Error('Failed to process PDF');
    }
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

    logger.debug({ matchThreshold, matchCount, documentId }, 'RAG Chat parameters');

    // Generate embedding for the question
    const questionEmbedding = await EmbeddingService.generateEmbedding(question);

    // Search for similar sections using match_document_sections
    const { data, error: matchError } = await supabase
        .rpc('match_document_sections', {
            query_embedding: questionEmbedding,
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
