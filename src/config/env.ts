import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    // Server
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('5000').transform(Number),

    // Supabase
    SUPABASE_URL: z.url({ error: 'Invalid Supabase URL' }),
    SUPABASE_ANON_KEY: z.string().min(1, { error: 'Supabase anon key is required' }),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, { error: 'Supabase service role key is required' }),

    // OpenAI / OpenRouter
    OPENAI_API_KEY: z.string().min(1, { error: 'OpenAI/OpenRouter API key is required' }),
    OPENAI_MODEL: z.string().default('gpt-4-turbo-preview'),
    OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
    OPENROUTER_BASE_URL: z.url().optional().default('https://openrouter.ai/api/v1'),

    // RAG Configuration
    CHUNK_SIZE: z.string().default('1000').transform(Number),
    CHUNK_OVERLAP: z.string().default('200').transform(Number),
    TOP_K_CHUNKS: z.string().default('5').transform(Number),

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number),
    RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
    env = envSchema.parse(process.env);
} catch (error) {
    if (error instanceof z.ZodError) {
        console.error('Invalid environment variables:');
        error.issues.forEach((issue) => {
            console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
        });
        process.exit(1);
    }
    throw error;
}

export { env };
