import pdfParse from 'pdf-parse-new';
import * as fs from 'fs/promises';
import * as path from 'path';

import { env } from '@/config/env';
import { openai, OPENAI_CONFIG } from '@/config/openai';
import { logger } from '@/utils/logger';
import { createSupabaseClient } from '@/config/supabase';
import { ValidationError } from '@/utils/errors';
import { chunkText } from '@/utils/chunking';

import { EmbeddingService } from '@/services/embedding.service';
import * as storageService from '@/services/storage.service';
import { llmService, MindmapAnalysis } from '@/services/llm.service';
import * as ragService from '@/modules/rag/service';

type ServiceParams<T = {}> = {
    userId: string;
    accessToken: string;
} & T;

/**
 * Export chunks to file for debugging
 */
const exportChunksDebug = async (
    chunks: string[],
    mindmapId: string,
    fileName: string
): Promise<void> => {
    if (env.NODE_ENV === 'development') return

    try {
        const lines = [
            '='.repeat(80),
            `CHUNK DEBUG EXPORT - ${new Date().toISOString()}`,
            `File: ${fileName}`,
            `Mindmap ID: ${mindmapId}`,
            `Total Chunks: ${chunks.length}`,
            '='.repeat(80),
            '',
        ];

        chunks.forEach((chunk, i) => {
            lines.push(`\n${'─'.repeat(80)}`);
            lines.push(`CHUNK #${i + 1} | ${chunk.length} chars`);
            lines.push(`${'─'.repeat(80)}\n`);
            lines.push(chunk.trim());
        });

        const exportDir = path.join(process.cwd(), 'exports');
        await fs.mkdir(exportDir, { recursive: true });
        const filePath = path.join(exportDir, `chunks_${mindmapId}_${Date.now()}.txt`);
        await fs.writeFile(filePath, lines.join('\n'), 'utf-8');

        logger.debug(`Chunks exported to: ${filePath}`);
    } catch (error) {
        logger.warn({ error }, 'Failed to export debug chunks');
    }
};

/**
 * Create mindmap from PDF (full unified workflow)
 */
export const createMindmapFromPdf = async (params: ServiceParams<{
    fileBuffer: Buffer;
    fileName: string;
    title?: string;
}>) => {
    const { userId, accessToken, fileBuffer, fileName, title } = params;
    const supabase = createSupabaseClient(accessToken);

    if (!fileName.toLowerCase().endsWith('.pdf')) {
        throw new ValidationError('Only PDF files are supported');
    }

    try {
        logger.info({ userId, fileName }, 'Processing PDF');

        // Step 1: Extract text + upload file (parallel)
        const [pdfData, uploadResult] = await Promise.all([
            pdfParse(fileBuffer),
            storageService.uploadFile(userId, fileBuffer, fileName, 'application/pdf'),
        ]);

        const text = pdfData.text.trim();
        if (!text) {
            throw new ValidationError('PDF contains no extractable text');
        }

        logger.info({
            pages: pdfData.numpages,
            chars: text.length
        }, 'PDF parsed successfully');

        // Step 2: Create file record in DB
        const { data: fileRecord, error: fileError } = await supabase
            .from('files')
            .insert({
                user_id: userId,
                path: fileName,
                storage_path: uploadResult.storage_path,
                file_size: uploadResult.file_size,
                mime_type: 'application/pdf',
            })
            .select()
            .single();

        if (fileError || !fileRecord) {
            throw new Error('Failed to create file record');
        }

        // Step 3: Generate mindmap structure + chunk text (parallel)
        logger.info('Generating mindmap and chunking text...');
        const [mindmapData, chunks] = await Promise.all([
            llmService.analyzePdfForMindmap(text, fileName),
            chunkText(text, {
                chunkSize: env.CHUNK_SIZE,
                chunkOverlap: env.CHUNK_OVERLAP,
            }),
        ]);

        logger.info({
            nodes: mindmapData.nodes.length,
            chunks: chunks.length,
        }, 'Mindmap structure & chunks generated');

        // Step 4: Generate embeddings
        const chunkEmbeddings = await EmbeddingService.generateEmbeddings(chunks);

        // Step 5: Create mindmap record
        const { data: mindmapRecord, error: mindmapError } = await supabase
            .from('mindmaps')
            .insert({
                owner_id: userId,
                title: title || mindmapData.title,
                source_file_id: fileRecord.id,
                mindmap_data: mindmapData,
            })
            .select()
            .single();

        if (mindmapError || !mindmapRecord) {
            throw new Error('Failed to create mindmap record');
        }

        // Step 6: Store chunks with embeddings
        // RAG queries will use pgvector to find relevant chunks regardless of node assignment
        const chunksPayload = chunks.map((chunk, index) => ({
            file_id: fileRecord.id,
            mindmap_id: mindmapRecord.id,
            node_id: 'node-0', // Root node - pgvector handles retrieval
            content: chunk,
            embedding: JSON.stringify(chunkEmbeddings[index]),
            chunk_index: index,
            metadata: {
                source: fileName,
                total_pages: pdfData.numpages,
            },
        }));

        const { error: chunksError } = await supabase
            .from('document_chunks')
            .insert(chunksPayload);

        if (chunksError) {
            throw new Error('Failed to store document chunks');
        }

        // Step 7: Get public URL + debug export (fire-and-forget)
        const fileUrl = await storageService.getFileUrl(uploadResult.storage_path);
        exportChunksDebug(chunks, mindmapRecord.id, fileName)

        logger.info({ mindmapId: mindmapRecord.id, userId }, 'Mindmap created successfully');

        return {
            id: mindmapRecord.id,
            title: mindmapRecord.title,
            file_id: fileRecord.id,
            storage_url: fileUrl,
            mindmap_data: mindmapData,
            chunks_created: chunks.length,
            nodes_count: mindmapData.nodes.length,
            created_at: mindmapRecord.created_at,
        };
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }
        logger.error({ error, userId, fileName }, 'PDF -> Mindmap workflow failed');
        throw new Error('Failed to process PDF and create mindmap');
    }
};

/**
 * Stream chat with specific node (scoped RAG)
 */
export const chatWithNode = async function* (params: {
    userId: string,
    accessToken: string,
    mindmapId: string,
    nodeId: string,
    question: string,
}): AsyncGenerator<string, void, unknown> {
    const { mindmapId, nodeId, question, userId, accessToken } = params;
    const supabase = createSupabaseClient(accessToken);

    // 1. Verify mindmap ownership
    const { data: mindmap, error: mindmapError } = await supabase
        .from('mindmaps')
        .select('id, title, mindmap_data')
        .eq('id', mindmapId)
        .eq('owner_id', userId)
        .single();

    if (mindmapError || !mindmap) {
        throw new Error('Mindmap not found');
    }

    // 2. Vector search for relevant chunks
    const questionEmbedding = await EmbeddingService.generateEmbedding(question);
    const embeddingArray = `[${questionEmbedding.join(',')}]`;

    const { data: topChunks, error: searchError } = await supabase
        .rpc('find_similar_chunks_for_node', {
            query_embedding: embeddingArray,
            p_mindmap_id: mindmapId,
            p_node_id: nodeId,
            top_k: env.TOP_K_CHUNKS,
        });

    if (searchError || !topChunks?.length) {
        yield "I couldn't find any relevant information for that question in this node.";
        return;
    }

    // Build context from pgvector results
    const context = topChunks.map((c: any) => c.content).join('\n\n');
    const mindmapData = mindmap.mindmap_data as MindmapAnalysis;
    const nodeInfo = mindmapData.nodes.find(n => n.id === nodeId);
    const nodeTopic = nodeInfo?.label || 'this topic';

    // 3. Create conversation & save user message
    const conversationId = await ragService.getOrCreateConversation(userId, undefined, supabase);
    await ragService.saveMessage(conversationId, 'user', question, {
        mindmap_id: mindmapId,
        node_id: nodeId,
        relevant_chunks: topChunks.map((c: any) => ({ id: c.id, similarity: c.similarity, chunk_index: c.chunk_index })),
    }, supabase);

    // 4. Stream from AI
    const stream = await openai.chat.completions.create({
        model: OPENAI_CONFIG.chatModel,
        messages: [
            {
                role: 'system',
                content: `You are an expert assistant helping with the topic: "${nodeTopic}".\nUse only the following context to answer. If the answer isn't there, say you don't know.\n\nContext:\n${context}`,
            },
            { role: 'user', content: question },
        ],
        stream: true,
        max_tokens: OPENAI_CONFIG.maxTokens,
        temperature: OPENAI_CONFIG.temperature,
    });

    let fullResponse = '';
    try {
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                yield content;
            }
        }
    } finally {
        // Save assistant message even if stream fails midway
        if (fullResponse.trim()) {
            await ragService.saveMessage(conversationId, 'assistant', fullResponse, undefined, supabase);
        }
    }
};
