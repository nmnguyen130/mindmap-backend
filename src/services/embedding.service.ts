import { pipeline, env as transformersEnv } from '@xenova/transformers';
import { logger } from '@/utils/logger';

// Configure Transformers.js to use local cache
transformersEnv.cacheDir = './.cache/transformers';

/**
 * Local embedding service using Transformers.js
 * Model: Xenova/all-MiniLM-L6-v2 (384 dimensions)
 * Optimized for CPU inference on consumer hardware
 */
class EmbeddingService {
    private static pipeline: any = null;
    private static initPromise: Promise<void> | null = null;
    private static readonly MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
    private static readonly EMBEDDING_DIMENSIONS = 384;

    /**
     * Initialize the embedding pipeline (downloads model on first run)
     */
    private static async initialize(): Promise<void> {
        if (this.pipeline) {
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            try {
                logger.info(`Initializing embedding model: ${this.MODEL_NAME}`);
                const startTime = Date.now();

                this.pipeline = await pipeline('feature-extraction', this.MODEL_NAME);

                const duration = Date.now() - startTime;
                logger.info(`Embedding model initialized in ${duration}ms`);
            } catch (error) {
                logger.error({ error }, 'Failed to initialize embedding model');
                throw error;
            }
        })();

        return this.initPromise;
    }

    /**
     * Generate embedding vector for input text
     * @param text Input text to embed
     * @returns 384-dimensional embedding vector
     */
    static async generateEmbedding(text: string): Promise<number[]> {
        if (!text || text.trim().length === 0) {
            throw new Error('Input text cannot be empty');
        }

        await this.initialize();

        try {
            const startTime = Date.now();

            // Generate embedding
            const output = await this.pipeline(text, {
                pooling: 'mean',
                normalize: true,
            });

            // Extract the embedding array
            const embedding = Array.from(output.data) as number[];

            const duration = Date.now() - startTime;
            logger.debug(`Generated embedding in ${duration}ms (${embedding.length} dimensions)`);

            if (embedding.length !== this.EMBEDDING_DIMENSIONS) {
                throw new Error(
                    `Expected ${this.EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`
                );
            }

            return embedding;
        } catch (error) {
            logger.error({ error, text: text.substring(0, 100) }, 'Failed to generate embedding');
            throw new Error('Failed to generate embedding');
        }
    }

    /**
     * Generate embeddings for multiple texts in batch
     * @param texts Array of texts to embed
     * @param batchSize Number of texts to process at once
     * @returns Array of embedding vectors
     */
    static async generateEmbeddings(
        texts: string[],
        batchSize: number = 8
    ): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            throw new Error('Input texts cannot be empty');
        }

        await this.initialize();

        const embeddings: number[][] = [];

        // Process in batches to balance speed and memory
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const startTime = Date.now();

            try {
                // Use batch processing
                const outputs = await this.pipeline(batch, {
                    pooling: 'mean',
                    normalize: true,
                });

                // Extract embeddings from batch
                for (let j = 0; j < batch.length; j++) {
                    const embedding = Array.from(outputs[j].data) as number[];
                    embeddings.push(embedding);
                }

                const duration = Date.now() - startTime;
                logger.debug(
                    `Batch ${Math.floor(i / batchSize) + 1}: Generated ${batch.length} embeddings in ${duration}ms (avg: ${(duration / batch.length).toFixed(0)}ms per embedding)`
                );
            } catch (error) {
                logger.error({ error, batchIndex: i }, 'Failed to generate batch embeddings');
                // Fallback to sequential for this batch
                for (const text of batch) {
                    const embedding = await this.generateEmbedding(text);
                    embeddings.push(embedding);
                }
            }
        }

        return embeddings;
    }

    /**
     * Get embedding dimensions
     */
    static get dimensions(): number {
        return this.EMBEDDING_DIMENSIONS;
    }

    /**
     * Get model name
     */
    static get modelName(): string {
        return this.MODEL_NAME;
    }
}

export { EmbeddingService };
