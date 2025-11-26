import pdfParse from 'pdf-parse-new';
import { createSupabaseClient } from '@/config/supabase';
import { EmbeddingService } from '@/services/embedding.service';
import { openai, OPENAI_CONFIG } from '@/config/openai';
import { logger } from '@/utils/logger';
import { ValidationError } from '@/utils/errors';
import { llmService, MindmapAnalysis } from '@/services/llm.service';

type ServiceParams<T = {}> = {
    userId: string;
    accessToken: string;
} & T;

/**
 * Split text into sections (paragraph-based chunking)
 * Based on GitHub reference process logic
 */
function splitIntoSections(text: string): string[] {
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
 * Generate embeddings for sections asynchronously
 * Based on GitHub reference: supabase/functions/embed/index.ts
 */
async function generateEmbeddingsForSections(
    sectionIds: string[],
    supabase: ReturnType<typeof createSupabaseClient>
): Promise<void> {
    const { data: sections, error: selectError } = await supabase
        .from('document_sections')
        .select('id, content')
        .in('id', sectionIds)
        .is('embedding', null);

    if (selectError || !sections) {
        logger.error({ selectError }, 'Failed to fetch sections for embedding');
        return;
    }

    for (const section of sections) {
        if (!section.content) continue;

        try {
            const embedding = await EmbeddingService.generateEmbedding(section.content);
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
 * Create mindmap from PDF - Complete unified workflow
 * Upload PDF → Create document → Process for RAG → Generate mindmap
 */
export const createMindmapFromPdf = async (params: ServiceParams<{
    fileBuffer: Buffer;
    fileName: string;
    title?: string;
}>): Promise<{
    id: string;
    title: string;
    document_id: string;
    mindmap_data: MindmapAnalysis;
    sections_created: number;
    nodes_count: number;
    created_at: string;
}> => {
    const { userId, accessToken, fileBuffer, fileName, title } = params;
    const supabase = createSupabaseClient(accessToken);

    if (!fileName.toLowerCase().endsWith('.pdf')) {
        throw new ValidationError('Only PDF files are supported');
    }

    try {
        logger.info({ userId, fileName }, 'Processing PDF for mindmap creation');

        // Step 1: Parse PDF to extract text
        const pdfData = await pdfParse(fileBuffer);
        const text = pdfData.text.trim();

        if (!text) {
            throw new ValidationError('PDF contains no extractable text');
        }

        logger.info({ pages: pdfData.numpages, chars: text.length }, 'PDF parsed successfully');

        // Step 2: Upload file to storage
        const { data: storageData, error: uploadError } = await supabase.storage
            .from('documents')
            .upload(`${userId}/${Date.now()}_${fileName}`, fileBuffer, {
                contentType: 'application/pdf',
                upsert: false,
            });

        if (uploadError || !storageData) {
            throw new Error(`Failed to upload file: ${uploadError?.message}`);
        }

        // Step 3: Get storage object ID
        const { data: storageObjects } = await supabase.storage
            .from('documents')
            .list(userId, {
                search: fileName,
            });

        const storageObject = storageObjects?.find(obj => obj.name === `${Date.now()}_${fileName}`.split('_').slice(1).join('_'));

        // Get storage object by path
        const { data: fileInfo } = await supabase
            .from('storage.objects')
            .select('id')
            .eq('bucket_id', 'documents')
            .eq('name', storageData.path)
            .single();

        if (!fileInfo) {
            throw new Error('Failed to get storage object ID');
        }

        // Step 4: Create document record
        const { data: document, error: docError } = await supabase
            .from('documents')
            .insert({
                name: fileName,
                storage_object_id: fileInfo.id,
                created_by: userId,
            })
            .select()
            .single();

        if (docError || !document) {
            throw new Error(`Failed to create document record: ${docError?.message}`);
        }

        logger.info({ documentId: document.id }, 'Document record created');

        // Step 5: Split text into sections
        const sections = splitIntoSections(text);
        logger.info({ documentId: document.id, sections: sections.length }, 'Split into sections');

        // Step 6: Insert document sections
        const { data: insertedSections, error: sectionsError } = await supabase
            .from('document_sections')
            .insert(
                sections.map(content => ({
                    document_id: document.id,
                    content,
                    metadata: {
                        source: fileName,
                        total_pages: pdfData.numpages,
                    },
                }))
            )
            .select('id');

        if (sectionsError || !insertedSections) {
            throw new Error(`Failed to insert document sections: ${sectionsError?.message}`);
        }

        logger.info({ documentId: document.id, sectionsCreated: insertedSections.length }, 'Document sections created');

        // Step 7: Generate embeddings asynchronously (background task)
        generateEmbeddingsForSections(
            insertedSections.map(s => s.id),
            supabase
        ).catch(err => {
            logger.error({ err, documentId: document.id }, 'Failed to generate embeddings');
        });

        // Step 8: Generate mindmap structure using LLM
        const mindmapData = await llmService.analyzePdfForMindmap(text, fileName);
        logger.info({ nodes: mindmapData.nodes.length }, 'Mindmap structure generated');

        // Step 9: Create mindmap record
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
            throw new Error(`Failed to create mindmap: ${mindmapError?.message}`);
        }

        logger.info({ mindmapId: mindmap.id, documentId: document.id }, 'Mindmap created successfully');

        return {
            id: mindmap.id,
            title: mindmap.title,
            document_id: document.id,
            mindmap_data: mindmapData,
            sections_created: insertedSections.length,
            nodes_count: mindmapData.nodes.length,
            created_at: mindmap.created_at,
        };
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }
        logger.error({ error, userId, fileName }, 'PDF to mindmap workflow failed');
        throw new Error('Failed to process PDF and create mindmap');
    }
};

/**
 * Chat with mindmap using RAG - Scoped to mindmap's source document
 * Based on GitHub reference: supabase/functions/chat/index.ts
 */
export async function* chatWithMindmap(params: ServiceParams<{
    mindmapId: string;
    question: string;
    matchThreshold?: number;
    matchCount?: number;
}>): AsyncGenerator<string, void, unknown> {
    const { userId, accessToken, mindmapId, question, matchThreshold = 0.5, matchCount = 5 } = params;
    const supabase = createSupabaseClient(accessToken);

    // 1. Get mindmap and verify ownership
    const { data: mindmap, error: mindmapError } = await supabase
        .from('mindmaps')
        .select('id, title, source_document_id, mindmap_data')
        .eq('id', mindmapId)
        .eq('owner_id', userId)
        .single();

    if (mindmapError || !mindmap) {
        throw new Error('Mindmap not found or access denied');
    }

    if (!mindmap.source_document_id) {
        yield "This mindmap has no associated document for context.";
        return;
    }

    // 2. Generate question embedding
    const questionEmbedding = await EmbeddingService.generateEmbedding(question);

    // 3. Search for similar sections using match_document_sections
    const { data: sections, error: matchError } = await supabase
        .rpc('match_document_sections', {
            embedding: questionEmbedding,
            match_threshold: matchThreshold,
            match_count: matchCount,
            filter_document_id: mindmap.source_document_id,
        })
        .select('content');

    if (matchError) {
        logger.error({ matchError, mindmapId, question }, 'Error matching document sections');
        throw new Error('Failed to search document sections');
    }

    const documents = (sections || []) as Array<{ content: string }>;

    // 4. Build context from matched documents
    const injectedDocs = documents.length > 0
        ? documents.map(({ content }) => content).join('\n\n')
        : 'No relevant information found';

    logger.info({ mindmapId, question, matchedSections: documents.length }, 'RAG context built');

    // 5. Create or get conversation
    const { data: conversation } = await supabase
        .from('conversations')
        .insert({
            user_id: userId,
            title: question.substring(0, 100),
            context_mode: 'rag',
            metadata: {
                mindmap_id: mindmapId,
                document_id: mindmap.source_document_id,
            },
        })
        .select()
        .single();

    const conversationId = conversation?.id;

    // 6. Save user message
    if (conversationId) {
        await supabase.from('messages').insert({
            conversation_id: conversationId,
            role: 'user',
            content: question,
            metadata: {
                mindmap_id: mindmapId,
                matched_sections: documents.length,
            },
        });
    }

    // 7. Build messages for OpenAI
    const completionMessages = [
        {
            role: 'user' as const,
            content: `You're an AI assistant who answers questions about the document titled "${mindmap.title}".

Keep your replies succinct and helpful.

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

    // 8. Stream response from OpenAI
    const completionStream = await openai.chat.completions.create({
        model: OPENAI_CONFIG.chatModel,
        messages: completionMessages,
        max_tokens: OPENAI_CONFIG.maxTokens,
        temperature: 0.7,
        stream: true,
    });

    let fullResponse = '';
    try {
        for await (const chunk of completionStream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                yield content;
            }
        }
    } finally {
        // 9. Save assistant message
        if (fullResponse.trim() && conversationId) {
            await supabase.from('messages').insert({
                conversation_id: conversationId,
                role: 'assistant',
                content: fullResponse,
            });
        }
    }
}
