import { supabaseAdmin } from '@/config/supabase';
import { EmbeddingService } from '@/services/embedding.service';
import * as storageService from '@/services/storage.service';
import { llmService, MindmapAnalysis } from '@/services/llm.service';
import { chunkTextBySentence } from '@/utils/chunking';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import pdfParse from 'pdf-parse-new';

/**
 * Extract text from PDF buffer
 */
export const extractPdfText = async (fileBuffer: Buffer): Promise<string> => {
    // Suppress pdf-parse warnings
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: any, encoding?: any, callback?: any): boolean => {
        const message = chunk.toString();
        if (message.includes('TT: CALL') || message.includes('Info:')) {
            if (typeof encoding === 'function') encoding();
            else if (typeof callback === 'function') callback();
            return true;
        }
        return originalWrite.call(process.stdout, chunk, encoding, callback);
    }) as any;

    try {
        const pdfData = await pdfParse(fileBuffer);
        return pdfData.text;
    } finally {
        process.stdout.write = originalWrite;
    }
};

/**
 * Map chunks to mindmap nodes based on semantic similarity
 */
const mapChunksToNodes = async (
    chunks: string[],
    chunkEmbeddings: number[][],
    mindmapNodes: MindmapAnalysis['nodes']
): Promise<Map<number, string[]>> => {
    const chunkToNodes = new Map<number, string[]>();

    // Generate embeddings for each node (label + keywords combined)
    const nodeTexts = mindmapNodes.map(
        (node) => `${node.label} ${node.keywords.join(' ')}`
    );
    const nodeEmbeddings = await EmbeddingService.generateEmbeddings(nodeTexts);

    // For each chunk, find best matching nodes (cosine similarity > threshold)
    const similarityThreshold = 0.55; // Lowered for better matching

    chunks.forEach((chunk, chunkIndex) => {
        const chunkEmbed = chunkEmbeddings[chunkIndex]!;
        const nodeMatches: Array<{ nodeId: string; similarity: number }> = [];

        nodeEmbeddings.forEach((nodeEmbed, nodeIndex) => {
            const similarity = cosineSimilarity(chunkEmbed, nodeEmbed);
            if (similarity >= similarityThreshold) {
                nodeMatches.push({
                    nodeId: mindmapNodes[nodeIndex]!.id,
                    similarity,
                });
            }
        });

        // Assign to top matching nodes (max 2)
        nodeMatches
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 2)
            .forEach((match) => {
                if (!chunkToNodes.has(chunkIndex)) {
                    chunkToNodes.set(chunkIndex, []);
                }
                chunkToNodes.get(chunkIndex)!.push(match.nodeId);
            });

        // If no match, assign to root node (node-0)
        if (!chunkToNodes.has(chunkIndex)) {
            chunkToNodes.set(chunkIndex, ['node-0']);
        }
    });

    return chunkToNodes;
};

/**
 * Cosine similarity helper
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

/**
 * Unified workflow: Upload PDF → Store → Generate Mindmap → Chunk → Link
 */
export const createMindmapFromPdf = async (
    userId: string,
    fileBuffer: Buffer,
    fileName: string,
    customTitle?: string
) => {
    try {
        // 1. Validate file
        if (!fileName.toLowerCase().endsWith('.pdf')) {
            throw new ValidationError('Only PDF files are supported');
        }

        // 2. Extract text from PDF
        const pdfText = await extractPdfText(fileBuffer);

        if (!pdfText || pdfText.trim().length < 100) {
            throw new ValidationError('PDF contains insufficient text content');
        }

        logger.info(`Extracted ${pdfText.length} characters from PDF: ${fileName}`);

        // 3. Upload file to Supabase Storage
        const uploadResult = await storageService.uploadFile(
            userId,
            fileBuffer,
            fileName,
            'application/pdf'
        );

        // 4. Create file record in database
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
            logger.error({ fileError }, 'Failed to create file record');
            throw new Error('Failed to create file record');
        }

        // 5. Generate mindmap structure using LLM
        const mindmapData = await llmService.analyzePdfForMindmap(pdfText, fileName);

        // 6. Chunk the document
        const chunks = chunkTextBySentence(pdfText, {
            chunkSize: env.CHUNK_SIZE,
            chunkOverlap: env.CHUNK_OVERLAP,
        });

        logger.info(`Created ${chunks.length} chunks from document`);

        // 7. Generate embeddings for chunks
        const chunkEmbeddings = await EmbeddingService.generateEmbeddings(chunks);

        // 8. Map chunks to mindmap nodes using semantic similarity
        const chunkToNodesMap = await mapChunksToNodes(
            chunks,
            chunkEmbeddings,
            mindmapData.nodes
        );

        // 9. Create mindmap record
        const { data: mindmapRecord, error: mindmapError } = await supabaseAdmin
            .from('mindmaps')
            .insert({
                user_id: userId,
                title: customTitle || mindmapData.title,
                source_file_id: fileData.id,
                mindmap_data: mindmapData,
            })
            .select()
            .single();

        if (mindmapError || !mindmapRecord) {
            logger.error({ mindmapError }, 'Failed to create mindmap record');
            throw new Error('Failed to create mindmap');
        }

        // 10. Store chunks with node mappings
        const chunksToInsert = chunks.flatMap((chunk, index) => {
            const nodeIds = chunkToNodesMap.get(index) || ['node-0'];
            // Create one chunk entry per node mapping (allows chunks to belong to multiple nodes)
            return nodeIds.map((nodeId) => ({
                file_id: fileData.id,
                mindmap_id: mindmapRecord.id,
                node_id: nodeId,
                content: chunk,
                embedding: JSON.stringify(chunkEmbeddings[index]),
                chunk_index: index,
            }));
        });

        const { error: insertError } = await supabaseAdmin
            .from('document_chunks')
            .insert(chunksToInsert);

        if (insertError) {
            logger.error({ insertError }, 'Failed to insert chunks');
            throw new Error('Failed to store document chunks');
        }

        // 11. Get signed URL for file download
        const fileUrl = await storageService.getFileUrl(uploadResult.storage_path);

        logger.info(
            `Successfully created mindmap with ${chunks.length} chunks and ` +
            `${mindmapData.nodes.length} nodes`
        );

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
        logger.error({ error, fileName, userId }, 'Failed to create mindmap from PDF');
        throw new Error('Failed to process PDF and create mindmap');
    }
};

/**
 * Chat with specific node's context (scoped RAG)
 */
export const chatWithNode = async function* (
    mindmapId: string,
    nodeId: string,
    question: string,
    userId: string
): AsyncGenerator<string, void, unknown> {
    // Import here to avoid circular dependency
    const { openai, OPENAI_CONFIG } = await import('@/config/openai');
    const ragService = await import('@/modules/rag/service');

    // 1. Verify mindmap belongs to user
    const { data: mindmap, error: mindmapError } = await supabaseAdmin
        .from('mindmaps')
        .select('id, title, mindmap_data')
        .eq('id', mindmapId)
        .eq('user_id', userId)
        .single();

    if (mindmapError || !mindmap) {
        throw new Error('Mindmap not found');
    }

    // 2. Get chunks for this specific node
    const { data: chunks, error: chunksError } = await supabaseAdmin
        .from('document_chunks')
        .select('id, content, embedding')
        .eq('mindmap_id', mindmapId)
        .eq('node_id', nodeId)
        .limit(env.TOP_K_CHUNKS * 2); // Get more for node context

    if (chunksError || !chunks || chunks.length === 0) {
        throw new Error('No content found for this node');
    }

    // 3. Generate embedding for question
    const questionEmbedding = await EmbeddingService.generateEmbedding(question);

    // 4. Rank chunks by similarity to question
    const chunksWithSimilarity = chunks.map((chunk: any) => {
        const chunkEmbedding = JSON.parse(chunk.embedding);
        const similarity = cosineSimilarity(questionEmbedding, chunkEmbedding);
        return {
            id: chunk.id,
            content: chunk.content,
            similarity,
        };
    });

    const topChunks = chunksWithSimilarity
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, env.TOP_K_CHUNKS);

    // 5. Build context from top chunks
    const context = topChunks.map((c) => c.content).join('\n\n');

    // 6. Find node info from mindmap_data
    const mindmapData = mindmap.mindmap_data as MindmapAnalysis;
    const nodeInfo = mindmapData.nodes.find((n) => n.id === nodeId);
    const nodeTopic = nodeInfo ? nodeInfo.label : 'this topic';

    // 7. Create conversation if needed
    const conversationId = await ragService.getOrCreateConversation(userId);

    // 8. Build messages
    const messages = [
        {
            role: 'system',
            content: `You are a helpful AI assistant. Answer questions about "${nodeTopic}" based on the following context from the document. If the context doesn't contain the answer, say so.

Context:
${context}`,
        },
        {
            role: 'user',
            content: question,
        },
    ];

    // 9. Save user message
    await ragService.saveMessage(conversationId, 'user', question, {
        mindmap_id: mindmapId,
        node_id: nodeId,
        relevant_chunks: topChunks.map((c) => ({ id: c.id, similarity: c.similarity })),
    });

    // 10. Stream response from OpenAI
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

    // 11. Save assistant message
    await ragService.saveMessage(conversationId, 'assistant', fullResponse);
};
