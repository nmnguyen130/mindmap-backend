import OpenAI from 'openai';
import { env } from './env';

export const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL,
});

// Configuration constants
// Note: Embeddings are now generated locally using all-MiniLM-L6-v2 (384 dimensions)
// See src/services/embedding.service.ts
export const OPENAI_CONFIG = {
    chatModel: env.OPENAI_MODEL,
    maxTokens: 2000,
    temperature: 0.7,
} as const;
