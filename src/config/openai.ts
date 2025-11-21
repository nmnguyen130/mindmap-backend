import OpenAI from 'openai';
import { env } from './env';

export const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL,
});

// Configuration constants
export const OPENAI_CONFIG = {
    chatModel: env.OPENAI_MODEL,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    embeddingDimensions: 1536, // text-embedding-3-small default
    maxTokens: 2000,
    temperature: 0.7,
} as const;
