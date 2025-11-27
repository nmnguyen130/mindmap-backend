import { pipeline, env as transformersEnv } from '@xenova/transformers';
import { logger } from '@/utils/logger';

// Configure Transformers.js to use local cache
transformersEnv.cacheDir = './.cache/transformers';

/**
 * Local embedding service using Transformers.js
 * Model: Xenova/all-MiniLM-L6-v2 (384 dimensions)
 */
class EmbeddingService {
    private static pipeline: any = null;
    private static initPromise: Promise<void> | null = null;

    // Model configuration
    private static readonly MODEL = {
        name: 'Xenova/gte-small',
        dimensions: 384,
        batchSize: 8,
    } as const;

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
                logger.info(`Initializing embedding model: ${this.MODEL.name} (${this.MODEL.dimensions} dims)`);
                const startTime = Date.now();

                this.pipeline = await pipeline('feature-extraction', this.MODEL.name);

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

            if (embedding.length !== this.MODEL.dimensions) {
                throw new Error(
                    `Expected ${this.MODEL.dimensions} dimensions, got ${embedding.length}`
                );
            }

            return embedding;
        } catch (error) {
            logger.error({ error, text: text.substring(0, 100) }, 'Failed to generate embedding');
            throw new Error('Failed to generate embedding');
        }
    }

    /**
     * Generate embeddings for multiple texts in batch (parallel processing)
     * @param texts Array of texts to embed
     * @returns Array of 384-dimensional embedding vectors
     */
    static async generateEmbeddings(texts: string[]): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            throw new Error('Input texts cannot be empty');
        }

        await this.initialize();

        const batchSize = this.MODEL.batchSize;

        // Split into batches
        const batches: string[][] = [];
        for (let i = 0; i < texts.length; i += batchSize) {
            batches.push(texts.slice(i, i + batchSize));
        }

        // Process all batches in parallel
        const batchPromises = batches.map(async (batch, batchIndex) => {
            const startTime = Date.now();

            try {
                const outputs = await this.pipeline(batch, {
                    pooling: 'mean',
                    normalize: true,
                });

                const batchEmbeddings: number[][] = [];
                for (let j = 0; j < batch.length; j++) {
                    const embedding = Array.from(outputs[j].data) as number[];
                    batchEmbeddings.push(embedding);
                }

                const duration = Date.now() - startTime;
                logger.debug(
                    `Batch ${batchIndex + 1}/${batches.length}: Generated ${batch.length} embeddings in ${duration}ms (avg: ${(duration / batch.length).toFixed(0)}ms/item)`
                );

                return batchEmbeddings;
            } catch (error) {
                logger.error({ error, batchIndex }, 'Batch embedding failed');
                // Fallback to sequential for this batch
                const fallbackEmbeddings: number[][] = [];
                for (const text of batch) {
                    const embedding = await this.generateEmbedding(text);
                    fallbackEmbeddings.push(embedding);
                }
                return fallbackEmbeddings;
            }
        });

        // Wait for all batches and flatten results
        const batchResults = await Promise.all(batchPromises);
        return batchResults.flat();
    }

    /**
     * Get embedding dimensions
     */
    static get dimensions(): number {
        return this.MODEL.dimensions;
    }

    /**
     * Get model name
     */
    static get modelName(): string {
        return this.MODEL.name;
    }
}

export { EmbeddingService };
