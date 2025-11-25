/**
 * Chunking Utility
 * Uses TokenTextSplitter for optimal token-based chunking
 */

import { TokenTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { logger } from './logger';
import { env } from '@/config/env';

export interface ChunkingOptions {
    chunkSize?: number;
    chunkOverlap?: number;
}

/**
 * Chunk documents using TokenTextSplitter
 */
export const chunkDocumentsWithOverlap = async (
    documents: Document[],
    options: ChunkingOptions = {}
): Promise<Document[]> => {
    const chunkSize = options.chunkSize || env.CHUNK_SIZE;
    const chunkOverlap = options.chunkOverlap || env.CHUNK_OVERLAP;

    logger.info(`Chunking documents: size=${chunkSize} tokens, overlap=${chunkOverlap} tokens`);

    const textSplitter = new TokenTextSplitter({
        chunkSize,
        chunkOverlap,
        encodingName: 'o200k_base', // OpenAI's o1/GPT-4o tokenizer
    });

    try {
        const chunks = await textSplitter.splitDocuments(documents);
        logger.info(`Created ${chunks.length} chunks from ${documents.length} documents`);
        return chunks;
    } catch (error) {
        logger.error({ error }, 'Chunking failed');
        throw new Error('Failed to chunk documents');
    }
};

/**
 * Chunk plain text using TokenTextSplitter
 * Token-based splitting ensures chunks respect LLM token limits
 */
export const chunkText = async (
    text: string,
    options: ChunkingOptions = {}
): Promise<string[]> => {
    const chunkSize = options.chunkSize || env.CHUNK_SIZE;
    const chunkOverlap = options.chunkOverlap || env.CHUNK_OVERLAP;

    const textSplitter = new TokenTextSplitter({
        chunkSize,
        chunkOverlap,
        encodingName: 'o200k_base',
    });

    try {
        const chunks = await textSplitter.splitText(text);
        logger.debug(`Split text into ${chunks.length} chunks (token-based)`);
        return chunks.filter((c) => c.trim().length > 0);
    } catch (error) {
        logger.error({ error }, 'Text splitting failed');
        throw new Error('Failed to split text');
    }
};
