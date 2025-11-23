/**
 * Vector Similarity Utilities
 * Shared functions for computing similarity between embeddings
 */

/**
 * Calculate cosine similarity between two vectors
 * Returns value between -1 (opposite) and 1 (identical)
 * 
 * @param vecA - First embedding vector
 * @param vecB - Second embedding vector
 * @returns Cosine similarity score
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
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
 * Calculate Euclidean distance between two vectors
 * Lower values indicate more similarity
 * 
 * @param vecA - First embedding vector
 * @param vecB - Second embedding vector
 * @returns Euclidean distance
 */
export function euclideanDistance(vecA: number[], vecB: number[]): number {
    let sum = 0;
    for (let i = 0; i < vecA.length; i++) {
        const diff = vecA[i]! - vecB[i]!;
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}
