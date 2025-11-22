import { supabaseAdmin } from '@/config/supabase';
import { openai, OPENAI_CONFIG } from '@/config/openai';
import { env } from '@/config/env';
import { EmbeddingService } from '@/services/embedding.service';
import { chunkTextBySentence } from '@/utils/chunking';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
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
 * Ingest document: chunk text, generate embeddings, store in DB
 */
export const ingestDocument = async (params: {
    userId: string;
    text?: string;
    fileBuffer?: Buffer;
    fileName?: string;
    mindmapId?: string;
}): Promise<IngestResult> => {
    const { userId, text, fileBuffer, fileName, mindmapId } = params;

    let content = text || '';

    // Extract text from PDF if file provided
    if (fileBuffer && fileName) {
        if (fileName.endsWith('.pdf')) {
            // Suppress pdf-parse warnings by intercepting stdout
            const originalWrite = process.stdout.write;

            // Intercept stdout writes to filter pdf-parse warnings
            process.stdout.write = ((chunk: any, encoding?: any, callback?: any): boolean => {
                const message = chunk.toString();
                // Filter out pdf-parse warning messages
                if (message.includes('TT: CALL') || message.includes('Info:')) {
                    if (typeof encoding === 'function') {
                        encoding(); // callback
                    } else if (typeof callback === 'function') {
                        callback();
                    }
                    return true;
                }
                return originalWrite.call(process.stdout, chunk, encoding, callback);
            }) as any;

            try {
                const pdfData = await pdfParse(fileBuffer);
                content = pdfData.text;
            } finally {
                process.stdout.write = originalWrite; // Restore stdout
            }
        } else if (fileName.endsWith('.txt')) {
            content = fileBuffer.toString('utf-8');
        } else {
            throw new ValidationError('Only PDF and TXT files are supported');
        }
    }

    if (!content || content.trim().length === 0) {
        throw new ValidationError('No content to ingest');
    }

    // Create file record
    const { data: fileData, error: fileError } = await supabaseAdmin
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
    const chunks = chunkTextBySentence(content, {
        chunkSize: env.CHUNK_SIZE,
        chunkOverlap: env.CHUNK_OVERLAP,
    });

    logger.info(`Created ${chunks.length} chunks from document`);

    // Generate embeddings for all chunks using batch processing (optimized)
    const embeddings = await EmbeddingService.generateEmbeddings(chunks);

    // Combine chunks with their embeddings
    const chunksWithEmbeddings = chunks.map((chunk: string, index: number) => ({
        file_id: fileData.id,
        mindmap_id: mindmapId || null,
        content: chunk,
        embedding: JSON.stringify(embeddings[index]),
        chunk_index: index,
    }));

    // Store chunks in database
    const { error: insertError } = await supabaseAdmin
        .from('document_chunks')
        .insert(chunksWithEmbeddings);

    if (insertError) {
        logger.error({ insertError }, 'Failed to insert chunks');
        throw new Error('Failed to store document chunks');
    }

    logger.info(`Successfully ingested document with ${chunks.length} chunks`);

    return {
        file_id: fileData.id,
        chunks_created: chunks.length,
    };
};

/**
 * Retrieve relevant chunks using vector similarity search
 */
export const retrieveRelevantChunks = async (
    question: string,
    userId: string,
    fileId?: string,
    mindmapId?: string
): Promise<Array<{ id: string; content: string; similarity: number }>> => {
    // Generate embedding for question using local model
    const questionEmbedding = await EmbeddingService.generateEmbedding(question);

    // Build query to find similar chunks
    let query = supabaseAdmin
        .from('document_chunks')
        .select('id, content, embedding')
        .limit(env.TOP_K_CHUNKS);

    // Filter by file or mindmap if provided
    if (fileId) {
        query = query.eq('file_id', fileId);
    }
    if (mindmapId) {
        query = query.eq('mindmap_id', mindmapId);
    }

    const { data: chunks, error } = await query;

    if (error) {
        logger.error({ error }, 'Failed to retrieve chunks');
        throw new Error('Failed to retrieve document chunks');
    }

    if (!chunks || chunks.length === 0) {
        return [];
    }

    // Calculate cosine similarity manually
    const chunksWithSimilarity = chunks.map((chunk: any) => {
        const chunkEmbedding = JSON.parse(chunk.embedding as string);
        const similarity = cosineSimilarity(questionEmbedding, chunkEmbedding);
        return {
            id: chunk.id,
            content: chunk.content,
            similarity,
        };
    });

    // Sort by similarity and return top K
    return chunksWithSimilarity
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, env.TOP_K_CHUNKS);
};

/**
 * Get conversation history
 */
export const getConversationHistory = async (
    conversationId: string,
    userId: string
): Promise<ChatMessage[]> => {
    const { data: messages, error } = await supabaseAdmin
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
    metadata?: Record<string, any>
): Promise<void> => {
    const { error } = await supabaseAdmin.from('messages').insert({
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
    conversationId?: string
): Promise<string> => {
    if (conversationId) {
        // Verify conversation exists and belongs to user
        const { data, error } = await supabaseAdmin
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
    const { data, error } = await supabaseAdmin
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
    conversationId?: string,
    fileId?: string,
    mindmapId?: string
): AsyncGenerator<string, void, unknown> {
    // Get or create conversation
    const convId = await getOrCreateConversation(userId, conversationId);

    // Retrieve relevant chunks
    const relevantChunks = await retrieveRelevantChunks(
        question,
        userId,
        fileId,
        mindmapId
    );

    // Get conversation history
    const history = await getConversationHistory(convId, userId);

    // Build context from chunks
    const context = relevantChunks.map((chunk) => chunk.content).join('\n\n');

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
    });

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
    await saveMessage(convId, 'assistant', fullResponse);
};

/**
 * Cosine similarity calculation
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        const a = vecA[i]!;
        const b = vecB[i]!;
        dotProduct += a * b;
        normA += a * a;
        normB += b * b;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
