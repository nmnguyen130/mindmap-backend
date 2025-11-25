import { supabaseAdmin } from '@/config/supabase';
import { EmbeddingService } from '@/services/embedding.service';
import * as storageService from '@/services/storage.service';
import { llmService, MindmapAnalysis } from '@/services/llm.service';
import { chunkText } from '@/utils/chunking';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
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
 * Assign chunks to mindmap nodes using LLM (replaces semantic similarity approach)
 * LLM decides which node(s) best fit each chunk based on content and mindmap structure
 * This eliminates the O(chunks × nodes) embedding comparisons
 */
const assignChunksToNodesWithLLM = async (
    chunks: string[],
    mindmapNodes: MindmapAnalysis['nodes']
): Promise<Map<number, string[]>> => {
    const chunkToNodes = new Map<number, string[]>();

    // Process chunks in batches to reduce LLM calls
    const BATCH_SIZE = 10; // Process 10 chunks per LLM call

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batchChunks = chunks.slice(i, i + BATCH_SIZE);

        // Create compact mindmap representation for LLM
        const nodesDescription = mindmapNodes.map(node =>
            `ID: ${node.id} | Label: ${node.label} | Keywords: ${node.keywords.join(', ')}`
        ).join('\n');

        const prompt = `Given these mindmap nodes:
            ${nodesDescription}

            And these text chunks (numbered ${i} to ${i + batchChunks.length - 1}):
            ${batchChunks.map((chunk, idx) => `[${i + idx}] ${chunk.substring(0, 300)}...`).join('\n\n')}

            For each chunk, determine which node(s) it belongs to. Return ONLY a JSON array like:
            [
            {"chunk": 0, "nodes": ["node-1", "node-2"]},
            {"chunk": 1, "nodes": ["node-0"]}
            ]

            Rules:
            - Assign 1-2 most relevant nodes per chunk
            - Use "node-0" (root) only if no specific node fits
            - Base decision on semantic relevance between chunk content and node topics`;

        try {
            const response = await llmService.generateCompletion(prompt, {
                temperature: 0.1, // Low temp for consistent assignments
                maxTokens: 1000,
            });

            // Extract JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error('No valid JSON array in response');
            }

            const assignments = JSON.parse(jsonMatch[0]) as Array<{ chunk: number; nodes: string[] }>;
            assignments.forEach((item) => {
                const chunkIndex = item.chunk;
                const nodeIds = item.nodes && item.nodes.length > 0 ? item.nodes : ['node-0'];
                chunkToNodes.set(chunkIndex, nodeIds);
            });

            logger.debug(`Assigned batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchChunks.length} chunks`);
        } catch (error) {
            logger.warn({ error, batch: i }, 'LLM chunk assignment failed, using fallback');
            // Fallback: assign all chunks in this batch to root
            for (let j = i; j < i + batchChunks.length && j < chunks.length; j++) {
                chunkToNodes.set(j, ['node-0']);
            }
        }
    }

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

        // Step 5: Create mindmap record and assign chunks using LLM in parallel
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
            assignChunksToNodesWithLLM(chunks, mindmapData.nodes),
        ]);

        const { data: mindmapRecord, error: mindmapError } = mindmapRecordResult;
        if (mindmapError || !mindmapRecord) {
            throw new Error('Failed to create mindmap');
        }

        // Step 6: Store chunks in database with 512-dim embeddings
        const chunksToInsert = chunks.flatMap((chunk, index) => {
            const nodeIds = chunkToNodesMap.get(index) || ['node-0'];
            return nodeIds.map((nodeId: string) => ({
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

    // Get chunks for node and perform similarity search using pgvector
    const questionEmbedding = await EmbeddingService.generateEmbedding(question);
    const embeddingArray = `[${questionEmbedding.join(',')}]`;

    const { data: topChunks, error: searchError } = await supabaseAdmin
        .rpc('find_similar_chunks_for_node', {
            query_embedding: embeddingArray,
            p_mindmap_id: mindmapId,
            p_node_id: nodeId,
            top_k: env.TOP_K_CHUNKS,
        });

    if (searchError) {
        logger.error({ searchError, mindmapId, nodeId }, 'Vector search failed');
        throw new Error('Failed to find relevant content');
    }

    if (!topChunks?.length) {
        throw new Error('No content found for this node');
    }

    // Build context from pgvector results
    const context = topChunks.map((c: any) => c.content).join('\n\n');
    const mindmapData = mindmap.mindmap_data as MindmapAnalysis;
    const nodeInfo = mindmapData.nodes.find(n => n.id === nodeId);
    const nodeTopic = nodeInfo?.label || 'this topic';

    // Create conversation and save message
    const conversationId = await ragService.getOrCreateConversation(userId);
    await ragService.saveMessage(conversationId, 'user', question, {
        mindmap_id: mindmapId,
        node_id: nodeId,
        relevant_chunks: topChunks.map((c: any) => ({ id: c.id, similarity: c.similarity, chunk_index: c.chunk_index })),
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
