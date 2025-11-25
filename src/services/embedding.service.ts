import { pipeline, env as transformersEnv } from '@xenova/transformers';
import { logger } from '@/utils/logger';

// Configure Transformers.js to use local cache
transformersEnv.cacheDir = './.cache/transformers';

// Type for model keys
type ModelKey = 'all-MiniLM';

/**
 * Local embedding service using Transformers.js
 * Model: Xenova/all-MiniLM-L6-v2 (384 dimensions)
 */
class EmbeddingService {
    private static pipeline: any = null;
    private static initPromise: Promise<void> | null = null;
    private static _currentModel: string = '';

    // Model configuration
    private static readonly MODEL = {
        name: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
        batchSize: 16, // Optimized for CPU
    } as const;

    private static readonly DEFAULT_MODEL: ModelKey = 'all-MiniLM';

    /**
     * Initialize the embedding pipeline (downloads model on first run)
     */
    private static async initialize(modelKey: ModelKey = this.DEFAULT_MODEL): Promise<void> {
        const model = this.MODEL;

        // Only re-initialize if model changed
        if (this.pipeline && this._currentModel === modelKey) {
            return;
        }

        if (this.initPromise && this._currentModel === modelKey) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            try {
                logger.info(`Initializing embedding model: ${model.name} (${model.dimensions} dims)`);
                const startTime = Date.now();

                this.pipeline = await pipeline('feature-extraction', model.name);
                this._currentModel = modelKey;

                const duration = Date.now() - startTime;
                logger.info(`Embedding model ${modelKey} initialized in ${duration}ms`);
            } catch (error) {
                logger.error({ error, model: modelKey }, 'Failed to initialize embedding model');
                throw error;
            }
        })();

        return this.initPromise;
    }

    /**
     * Generate embedding vector for input text
     * @param text Input text to embed
     * @param modelKey Model to use (default: all-MiniLM)
     * @returns 384-dimensional embedding vector
     */
    static async generateEmbedding(text: string, modelKey: ModelKey = this.DEFAULT_MODEL): Promise<number[]> {
        if (!text || text.trim().length === 0) {
            throw new Error('Input text cannot be empty');
        }

        await this.initialize(modelKey);
        const model = this.MODEL;

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
            logger.debug(`Generated embedding in ${duration}ms (${embedding.length} dimensions, model: ${modelKey})`);

            if (embedding.length !== model.dimensions) {
                throw new Error(
                    `Expected ${model.dimensions} dimensions for ${modelKey}, got ${embedding.length}`
                );
            }

            return embedding;
        } catch (error) {
            logger.error({ error, text: text.substring(0, 100), model: modelKey }, 'Failed to generate embedding');
            throw new Error('Failed to generate embedding');
        }
    }

    /**
     * Generate embeddings for multiple texts in batch
     * @param texts Array of texts to embed
     * @param modelKey Model to use (default: all-MiniLM)
     * @returns Array of 384-dimensional embedding vectors
     */
    static async generateEmbeddings(
        texts: string[],
        modelKey: ModelKey = this.DEFAULT_MODEL
    ): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            throw new Error('Input texts cannot be empty');
        }

        await this.initialize(modelKey);
        const model = this.MODEL;

        const embeddings: number[][] = [];

        // Use model-specific batch size to balance speed and memory
        const batchSize = model.batchSize;

        // Process in batches
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
                    `Batch ${Math.floor(i / batchSize) + 1}: Generated ${batch.length} embeddings in ${duration}ms (avg: ${(duration / batch.length).toFixed(0)}ms/item, model: ${modelKey})`
                );
            } catch (error) {
                logger.error({ error, batchIndex: i, model: modelKey }, 'Failed to generate batch embeddings');
                // Fallback to sequential for this batch
                for (const text of batch) {
                    const embedding = await this.generateEmbedding(text, modelKey);
                    embeddings.push(embedding);
                }
            }
        }

        return embeddings;
    }

    /**
     * Get embedding dimensions
     */
    static getDimensions(modelKey: ModelKey = this.DEFAULT_MODEL): number {
        return this.MODEL.dimensions;
    }

    /**
     * Get model name
     */
    static getModelName(modelKey: ModelKey = this.DEFAULT_MODEL): string {
        return this.MODEL.name;
    }

    /**
     * Get current active model
     */
    static get currentModel(): string {
        return this._currentModel || this.DEFAULT_MODEL;
    }

    // Legacy getters for backward compatibility
    static get dimensions(): number {
        return this.getDimensions();
    }

    static get modelName(): string {
        return this.getModelName();
    }
}

export { EmbeddingService };
export type { ModelKey };
