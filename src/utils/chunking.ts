import { env } from '@/config/env';

interface ChunkOptions {
    chunkSize?: number;
    chunkOverlap?: number;
}

/**
 * Split text into overlapping chunks for embedding
 */
export const chunkText = (
    text: string,
    options: ChunkOptions = {}
): string[] => {
    const chunkSize = options.chunkSize || env.CHUNK_SIZE;
    const chunkOverlap = options.chunkOverlap || env.CHUNK_OVERLAP;

    if (text.length <= chunkSize) {
        return [text];
    }

    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
        const endIndex = Math.min(startIndex + chunkSize, text.length);
        const chunk = text.slice(startIndex, endIndex);
        chunks.push(chunk.trim());

        // Move forward, accounting for overlap
        startIndex += chunkSize - chunkOverlap;

        // Prevent infinite loop if overlap >= chunkSize
        if (startIndex <= chunks.length * chunkOverlap) {
            startIndex = chunks.length * chunkSize;
        }
    }

    return chunks.filter((chunk) => chunk.length > 0);
};

/**
 * Split text into chunks at sentence boundaries for better semantic coherence
 */
export const chunkTextBySentence = (
    text: string,
    options: ChunkOptions = {}
): string[] => {
    const chunkSize = options.chunkSize || env.CHUNK_SIZE;
    const chunkOverlap = options.chunkOverlap || env.CHUNK_OVERLAP;

    // Split by sentence
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length <= chunkSize) {
            currentChunk += sentence;
        } else {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks.filter((chunk) => chunk.length > 0);
};
