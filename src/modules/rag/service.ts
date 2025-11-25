import { SupabaseClient } from '@supabase/supabase-js';
import { openai, OPENAI_CONFIG } from '@/config/openai';
import { env } from '@/config/env';
import { EmbeddingService } from '@/services/embedding.service';
import { chunkText, chunkDocumentsWithOverlap } from '@/utils/chunking';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { Document } from '@langchain/core/documents';
import pdfParse from 'pdf-parse-new';

interface IngestResult {
    file_id: string;
    chunks_created: number;
}

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

/**
 * Ingest PDF document: extract text, chunk, generate embeddings, store in DB
 */
export const ingestPdfDocument = async (params: {
    userId: string;
    fileBuffer: Buffer;
    fileName: string;
    mindmapId?: string;
    supabase: SupabaseClient;
}): Promise<IngestResult> => {
    const { userId, fileBuffer, fileName, mindmapId, supabase } = params;

    if (!fileName.toLowerCase().endsWith('.pdf')) {
        throw new ValidationError('Only PDF files are supported');
    }

    try {
        // Extract text from PDF using pdf-parse-new
        logger.info(`Extracting text from PDF: ${fileName}`);
        const pdfData = await pdfParse(fileBuffer);
        const fullText = pdfData.text;

        if (!fullText || fullText.trim().length === 0) {
            throw new ValidationError('PDF contains no extractable text');
        }

        logger.info(`Extracted ${fullText.length} characters from ${pdfData.numpages} pages`);

        // Create file record
        const { data: fileData, error: fileError } = await supabase
            .from('files')
            .insert({
                user_id: userId,
                path: fileName,
            })
            .select()
            .single();

        if (fileError || !fileData) {
            logger.error({ fileError }, 'Failed to create file record');
            throw new Error('Failed to create file record');
        }

        // Chunk the text using RecursiveCharacterTextSplitter
        const chunks = await chunkText(fullText, {
            chunkSize: env.CHUNK_SIZE,
            chunkOverlap: env.CHUNK_OVERLAP,
        });

        logger.info(`Created ${chunks.length} chunks from PDF`);

        // Generate embeddings for all chunks
        const embeddings = await EmbeddingService.generateEmbeddings(chunks);

        // Prepare chunks with embeddings for storage
        const chunksWithEmbeddings = chunks.map((chunk, index) => ({
            file_id: fileData.id,
            mindmap_id: mindmapId || null,
            content: chunk,
            embedding: JSON.stringify(embeddings[index]),
            chunk_index: index,
            metadata: {
                source: fileName,
                total_pages: pdfData.numpages,
            },
        }));

        // Store chunks in database
        const { error: insertError } = await supabase
            .from('document_chunks')
            .insert(chunksWithEmbeddings);

        if (insertError) {
            logger.error({ insertError }, 'Failed to insert chunks');
            throw new Error('Failed to store document chunks');
        }

        logger.info(`Successfully ingested PDF with ${chunks.length} chunks`);

        return {
            file_id: fileData.id,
            chunks_created: chunks.length,
        };
    } catch (error: any) {
        logger.error({ error, fileName }, 'PDF ingestion failed');
        throw new Error(`Failed to process PDF: ${error.message}`);
    }
};

/**
 * Ingest plain text document
 */
export const ingestDocument = async (params: {
    userId: string;
    text?: string;
    fileBuffer?: Buffer;
    fileName?: string;
    mindmapId?: string;
    supabase: SupabaseClient;
}): Promise<IngestResult> => {
    const { userId, text, fileBuffer, fileName, mindmapId, supabase } = params;

    let content = text || '';

    // Route to PDF ingestion if PDF file
    if (fileBuffer && fileName) {
        if (fileName.toLowerCase().endsWith('.pdf')) {
            return ingestPdfDocument({ userId, fileBuffer, fileName, mindmapId, supabase });
        } else if (fileName.endsWith('.txt')) {
            content = fileBuffer.toString('utf-8');
        } else {
            throw new ValidationError('Only TXT and PDF files supported');
        }
    }

    if (!content || content.trim().length === 0) {
        throw new ValidationError('No content to ingest');
    }

    // Create file record
    const { data: fileData, error: fileError } = await supabase
        .from('files')
        .insert({
            user_id: userId,
            path: fileName || `text-${Date.now()}.txt`,
        })
        .select()
        .single();

    if (fileError || !fileData) {
        logger.error({ fileError }, 'Failed to create file record');
        throw new Error('Failed to create file record');
    }

    // Chunk text
    const chunks = await chunkText(content, {
        chunkSize: env.CHUNK_SIZE,
        chunkOverlap: env.CHUNK_OVERLAP,
    });

    logger.info(`Created ${chunks.length} chunks from text`);

    // Generate embeddings
    const embeddings = await EmbeddingService.generateEmbeddings(chunks);

    // Prepare chunks with embeddings
    const chunksWithEmbeddings = chunks.map((chunk, index) => ({
        file_id: fileData.id,
        mindmap_id: mindmapId || null,
        content: chunk,
        embedding: JSON.stringify(embeddings[index]),
        chunk_index: index,
    }));

    // Store chunks
    const { error: insertError } = await supabase
        .from('document_chunks')
        .insert(chunksWithEmbeddings);

    if (insertError) {
        logger.error({ insertError }, 'Failed to insert chunks');
        throw new Error('Failed to store document chunks');
    }

    logger.info(`Successfully ingested text with ${chunks.length} chunks`);

    return {
        file_id: fileData.id,
        chunks_created: chunks.length,
    };
};

/**
 * Retrieve relevant chunks using vector similarity search with pgvector
 */
export const retrieveRelevantChunks = async (
    question: string,
    userId: string,
    fileId: string | undefined,
    mindmapId: string | undefined,
    supabase: SupabaseClient
): Promise<Array<{ id: string; content: string; similarity: number }>> => {
    const questionEmbedding = await EmbeddingService.generateEmbedding(question);
    const embeddingArray = `[${questionEmbedding.join(',')}]`;

    const { data: chunks, error } = await supabase
        .rpc('find_similar_chunks', {
            query_embedding: embeddingArray,
            file_id: fileId || null,
            mindmap_id: mindmapId || null,
            top_k: env.TOP_K_CHUNKS,
        });

    if (error) {
        logger.error({ error }, 'Failed to retrieve chunks with pgvector');
        throw new Error('Failed to retrieve document chunks');
    }

    if (!chunks || chunks.length === 0) {
        return [];
    }

    return chunks.map((chunk: any) => ({
        id: chunk.id,
        content: chunk.content,
        similarity: chunk.similarity,
    }));
};

/**
 * Get conversation history
 */
export const getConversationHistory = async (
    conversationId: string,
    userId: string,
    supabase: SupabaseClient
): Promise<ChatMessage[]> => {
    const { data: messages, error } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

    if (error) {
        logger.error({ error }, 'Failed to get conversation history');
        throw new Error('Failed to retrieve conversation history');
    }

    return messages as ChatMessage[];
};

/**
 * Save message to conversation
 */
export const saveMessage = async (
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata: Record<string, any> | undefined,
    supabase: SupabaseClient
): Promise<void> => {
    const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        role,
        content,
        metadata: metadata || {},
    });

    if (error) {
        logger.error({ error }, 'Failed to save message');
        throw new Error('Failed to save message');
    }
};

/**
 * Create or get conversation
 */
export const getOrCreateConversation = async (
    userId: string,
    conversationId: string | undefined,
    supabase: SupabaseClient
): Promise<string> => {
    if (conversationId) {
        const { data, error } = await supabase
            .from('conversations')
            .select('id')
            .eq('id', conversationId)
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            throw new NotFoundError('Conversation not found');
        }

        return conversationId;
    }

    // Create new conversation
    const { data, error } = await supabase
        .from('conversations')
        .insert({
            user_id: userId,
            context_mode: 'rag',
        })
        .select()
        .single();

    if (error || !data) {
        logger.error({ error }, 'Failed to create conversation');
        throw new Error('Failed to create conversation');
    }

    return data.id;
};

/**
 * Generate streaming chat completion with RAG context
 */
export const generateChatCompletion = async function* (
    question: string,
    userId: string,
    conversationId: string | undefined,
    fileId: string | undefined,
    mindmapId: string | undefined,
    supabase: SupabaseClient
): AsyncGenerator<string, void, unknown> {
    const convId = await getOrCreateConversation(userId, conversationId, supabase);

    // Retrieve relevant chunks
    const relevantChunks = await retrieveRelevantChunks(
        question,
        userId,
        fileId,
        mindmapId,
        supabase
    );

    // Get conversation history
    const history = await getConversationHistory(convId, userId, supabase);

    // Build context from chunks
    const context = relevantChunks.map((chunk) => chunk.content).join('\\n\\n');

    // Build messages for OpenAI
    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: `You are a helpful AI assistant. Answer the user's question based on the following context. If the context doesn't contain relevant information, say so.

Context:
${context}`,
        },
        ...history,
        {
            role: 'user',
            content: question,
        },
    ];

    // Save user message
    await saveMessage(convId, 'user', question, {
        relevant_chunks: relevantChunks.map((c) => ({ id: c.id, similarity: c.similarity })),
    }, supabase);

    // Stream response from OpenAI
    const stream = await openai.chat.completions.create({
        model: OPENAI_CONFIG.chatModel,
        messages: messages as any,
        stream: true,
        max_tokens: OPENAI_CONFIG.maxTokens,
        temperature: OPENAI_CONFIG.temperature,
    });

    let fullResponse = '';

    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
            fullResponse += content;
            yield content;
        }
    }

    // Save assistant message
    await saveMessage(convId, 'assistant', fullResponse, undefined, supabase);
};
