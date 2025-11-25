/**
 * Chunking Utility - 2025 Best Practices
 * Uses RecursiveCharacterTextSplitter for optimal semantic chunking
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { logger } from './logger';
import { env } from '@/config/env';

export interface ChunkingOptions {
    chunkSize?: number;
    chunkOverlap?: number;
}

/**
 * Chunk documents using RecursiveCharacterTextSplitter (2025 best practices)
 * - Chunk Size: 512 tokens (optimal for most embedding models)
 * - Overlap: 100 tokens (20% overlap to preserve context)
 * - Separators: Prioritizes paragraph → sentence → word boundaries
 */
export const chunkDocumentsWithOverlap = async (
    documents: Document[],
    options: ChunkingOptions = {}
): Promise<Document[]> => {
    const chunkSize = options.chunkSize || env.CHUNK_SIZE;
    const chunkOverlap = options.chunkOverlap || env.CHUNK_OVERLAP;

    logger.info(`Chunking documents: size=${chunkSize}, overlap=${chunkOverlap}`);

    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ', ''],
        keepSeparator: true,
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
 * Chunk plain text using RecursiveCharacterTextSplitter
 */
export const chunkText = async (
    text: string,
    options: ChunkingOptions = {}
): Promise<string[]> => {
    const chunkSize = options.chunkSize || env.CHUNK_SIZE;
    const chunkOverlap = options.chunkOverlap || env.CHUNK_OVERLAP;

    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ', ''],
        keepSeparator: true,
    });

    try {
        const chunks = await textSplitter.splitText(text);
        logger.debug(`Split text into ${chunks.length} chunks`);
        return chunks.filter((c) => c.trim().length > 0);
    } catch (error) {
        logger.error({ error }, 'Text splitting failed');
        throw new Error('Failed to split text');
    }
};
