import { supabaseAdmin } from '@/config/supabase';
import { EmbeddingService } from '@/services/embedding.service';
import * as storageService from '@/services/storage.service';
import { llmService, MindmapAnalysis } from '@/services/llm.service';
import { chunkText } from '@/utils/chunking';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { cosineSimilarity } from '@/utils/similarity';
import pdfParse from 'pdf-parse-new';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Export chunks to file for debugging (optional, can be disabled for performance)
 */
const exportChunksDebug = async (
    chunks: string[],
    mindmapId: string,
    fileName: string
): Promise<void> => {
    try {
        const output = [
            '='.repeat(80),
            `CHUNK DEBUG EXPORT`,
            `File: ${fileName}`,
            `Mindmap ID: ${mindmapId}`,
            `Total Chunks: ${chunks.length}`,
            `Timestamp: ${new Date().toISOString()}`,
            '='.repeat(80),
            '',
        ];

        chunks.forEach((chunk, index) => {
            output.push(`\n${'='.repeat(80)}`);
            output.push(`CHUNK #${index + 1} | Length: ${chunk.length} chars`);
            output.push(`${'='.repeat(80)}\n`);
            output.push(chunk);
        });

        const exportDir = path.join(process.cwd(), 'exports');
        await fs.mkdir(exportDir, { recursive: true });

        const exportPath = path.join(exportDir, `chunks_${mindmapId}_${Date.now()}.txt`);
        await fs.writeFile(exportPath, output.join('\n'), 'utf-8');

        logger.debug(`Chunks exported to: ${exportPath}`);
    } catch (error) {
        logger.warn({ error }, 'Failed to export debug chunks');
    }
};

/**
 * Map chunks to mindmap nodes based on semantic similarity
 */
const mapChunksToNodes = async (
    chunkEmbeddings: number[][],
    mindmapNodes: MindmapAnalysis['nodes']
): Promise<Map<number, string[]>> => {
    const chunkToNodes = new Map<number, string[]>();

    // Generate embeddings for nodes
    const nodeTexts = mindmapNodes.map(node => `${node.label} ${node.keywords.join(' ')}`);
    const nodeEmbeddings = await EmbeddingService.generateEmbeddings(nodeTexts);

    const threshold = 0.55;

    chunkEmbeddings.forEach((chunkEmbed, chunkIndex) => {
        const matches: Array<{ nodeId: string; similarity: number }> = [];

        nodeEmbeddings.forEach((nodeEmbed, nodeIndex) => {
            const similarity = cosineSimilarity(chunkEmbed, nodeEmbed);
            if (similarity >= threshold) {
                matches.push({
                    nodeId: mindmapNodes[nodeIndex]!.id,
                    similarity,
                });
            }
        });

        // Assign to top 2 matching nodes or fallback to root
        const assignedNodes = matches
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 2)
            .map(m => m.nodeId);

        chunkToNodes.set(chunkIndex, assignedNodes.length > 0 ? assignedNodes : ['node-0']);
    });

    return chunkToNodes;
};

/**
 * Create mindmap from PDF - Optimized workflow
 */
export const createMindmapFromPdf = async (
    userId: string,
    fileBuffer: Buffer,
    fileName: string,
    customTitle?: string
) => {
    if (!fileName.toLowerCase().endsWith('.pdf')) {
        throw new ValidationError('Only PDF files are supported');
    }

    try {
        logger.info(`Processing PDF: ${fileName}`);

        // Step 1: Upload file and extract text in parallel
        const [uploadResult, pdfData] = await Promise.all([
            storageService.uploadFile(userId, fileBuffer, fileName, 'application/pdf'),
            pdfParse(fileBuffer),
        ]);

        const pdfText = pdfData.text;
        if (!pdfText?.trim()) {
            throw new ValidationError('PDF contains no extractable text');
        }

        logger.info(`Extracted ${pdfText.length.toLocaleString()} chars from ${pdfData.numpages} pages`);

        // Step 2: Create file record
        const { data: fileData, error: fileError } = await supabaseAdmin
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

        if (fileError || !fileData) {
            throw new Error('Failed to create file record');
        }

        // Step 3: Generate mindmap and chunk text in parallel
        logger.info(`Generating mindmap and chunking text...`);
        const [mindmapData, chunks] = await Promise.all([
            llmService.analyzePdfForMindmap(pdfText, fileName),
            chunkText(pdfText, {
                chunkSize: env.CHUNK_SIZE,
                chunkOverlap: env.CHUNK_OVERLAP,
            }),
        ]);

        logger.info(`Created ${mindmapData.nodes.length} nodes, ${chunks.length} chunks`);

        // Step 4: Generate embeddings for chunks
        const chunkEmbeddings = await EmbeddingService.generateEmbeddings(chunks);

        // Step 5: Create mindmap record and map chunks to nodes in parallel
        const [mindmapRecordResult, chunkToNodesMap] = await Promise.all([
            supabaseAdmin
                .from('mindmaps')
                .insert({
                    owner_id: userId,
                    title: customTitle || mindmapData.title,
                    source_file_id: fileData.id,
                    mindmap_data: mindmapData,
                })
                .select()
                .single(),
            mapChunksToNodes(chunkEmbeddings, mindmapData.nodes),
        ]);

        const { data: mindmapRecord, error: mindmapError } = mindmapRecordResult;
        if (mindmapError || !mindmapRecord) {
            throw new Error('Failed to create mindmap');
        }

        // Step 6: Store chunks in database
        const chunksToInsert = chunks.flatMap((chunk, index) => {
            const nodeIds = chunkToNodesMap.get(index) || ['node-0'];
            return nodeIds.map(nodeId => ({
                file_id: fileData.id,
                mindmap_id: mindmapRecord.id,
                node_id: nodeId,
                content: chunk,
                embedding: JSON.stringify(chunkEmbeddings[index]),
                chunk_index: index,
                metadata: {
                    source: fileName,
                    total_pages: pdfData.numpages,
                },
            }));
        });

        const { error: insertError } = await supabaseAdmin
            .from('document_chunks')
            .insert(chunksToInsert);

        if (insertError) {
            throw new Error('Failed to store chunks');
        }

        // Step 7: Get file URL and export debug (non-blocking)
        const fileUrl = await storageService.getFileUrl(uploadResult.storage_path);

        // Export chunks debug (async, don't wait)
        if (env.NODE_ENV === 'development') {
            exportChunksDebug(chunks, mindmapRecord.id, fileName).catch(() => { });
        }

        logger.info(`Mindmap created: ${chunks.length} chunks, ${mindmapData.nodes.length} nodes`);

        return {
            id: mindmapRecord.id,
            title: mindmapRecord.title,
            file_id: fileData.id,
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
        logger.error({ error, fileName }, 'Failed to create mindmap');
        throw new Error('Failed to process PDF and create mindmap');
    }
};

/**
 * Chat with specific node context (scoped RAG)
 */
export const chatWithNode = async function* (
    mindmapId: string,
    nodeId: string,
    question: string,
    userId: string
): AsyncGenerator<string, void, unknown> {
    const { openai, OPENAI_CONFIG } = await import('@/config/openai');
    const ragService = await import('@/modules/rag/service');

    // Verify mindmap ownership
    const { data: mindmap, error: mindmapError } = await supabaseAdmin
        .from('mindmaps')
        .select('id, title, mindmap_data')
        .eq('id', mindmapId)
        .eq('owner_id', userId)
        .single();

    if (mindmapError || !mindmap) {
        throw new Error('Mindmap not found');
    }

    // Get chunks for node
    const { data: chunks, error: chunksError } = await supabaseAdmin
        .from('document_chunks')
        .select('id, content, embedding')
        .eq('mindmap_id', mindmapId)
        .eq('node_id', nodeId)
        .limit(env.TOP_K_CHUNKS * 2);

    if (chunksError || !chunks?.length) {
        throw new Error('No content found for this node');
    }

    // Rank chunks by similarity
    const questionEmbedding = await EmbeddingService.generateEmbedding(question);

    const topChunks = chunks
        .map((chunk: any) => ({
            id: chunk.id,
            content: chunk.content,
            similarity: cosineSimilarity(questionEmbedding, JSON.parse(chunk.embedding)),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, env.TOP_K_CHUNKS);

    // Build context
    const context = topChunks.map(c => c.content).join('\n\n');
    const mindmapData = mindmap.mindmap_data as MindmapAnalysis;
    const nodeInfo = mindmapData.nodes.find(n => n.id === nodeId);
    const nodeTopic = nodeInfo?.label || 'this topic';

    // Create conversation and save message
    const conversationId = await ragService.getOrCreateConversation(userId);
    await ragService.saveMessage(conversationId, 'user', question, {
        mindmap_id: mindmapId,
        node_id: nodeId,
        relevant_chunks: topChunks.map(c => ({ id: c.id, similarity: c.similarity })),
    });

    // Stream response
    const stream = await openai.chat.completions.create({
        model: OPENAI_CONFIG.chatModel,
        messages: [
            {
                role: 'system',
                content: `You are a helpful AI assistant. Answer questions about "${nodeTopic}" based on the following context. If the context doesn't contain the answer, say so.\n\nContext:\n${context}`,
            },
            {
                role: 'user',
                content: question,
            },
        ] as any,
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

    await ragService.saveMessage(conversationId, 'assistant', fullResponse);
};
