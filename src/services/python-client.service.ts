/**
 * Python Microservice Client
 * HTTP client for communicating with Python ML service
 */

import { logger } from '@/utils/logger';
import { env } from '@/config/env';

interface PdfConversionResponse {
    success: boolean;
    markdown?: string;
    metadata?: {
        pages: number;
        chars: number;
        images_extracted: number;
    };
    error?: string;
}

interface EmbeddingsResponse {
    success: boolean;
    embeddings?: number[][];
    model?: string;
    error?: string;
}

/**
 * Convert PDF buffer to structured Markdown using Python service
 */
export const convertPdfToMarkdown = async (pdfBuffer: Buffer): Promise<string> => {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Convert buffer to base64
            const pdfBase64 = pdfBuffer.toString('base64');

            logger.info(`Calling Python service for PDF conversion (attempt ${attempt}/${maxRetries})`);

            // Call Python service
            const response = await fetch(`${env.PYTHON_SERVICE_URL}/convert-pdf`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pdf_base64: pdfBase64,
                    filename: 'document.pdf',
                }),
                signal: AbortSignal.timeout(120000), // 2 minute timeout
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Python service returned ${response.status}: ${errorText}`);
            }

            const data = await response.json() as PdfConversionResponse;

            if (!data.success || !data.markdown) {
                throw new Error(data.error || 'PDF conversion failed');
            }

            logger.info(
                `PDF converted successfully: ${data.metadata?.pages} pages, ` +
                `${data.metadata?.chars} characters`
            );

            return data.markdown;
        } catch (error) {
            lastError = error as Error;
            logger.warn(
                { error, attempt, maxRetries },
                `Python service call failed (attempt ${attempt}/${maxRetries})`
            );

            // Don't retry on timeout or if it's the last attempt
            if (attempt === maxRetries || error instanceof TypeError) {
                break;
            }

            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }

    // All retries failed
    logger.error({ error: lastError }, 'Python service unavailable after retries');
    throw new Error(
        `Failed to convert PDF: Python service unavailable. ` +
        `Please ensure the service is running at ${env.PYTHON_SERVICE_URL}`
    );
};

/**
 * Generate embeddings using Python service (future implementation)
 */
export const generateEmbeddings = async (texts: string[]): Promise<number[][]> => {
    try {
        const response = await fetch(`${env.PYTHON_SERVICE_URL}/generate-embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ texts }),
            signal: AbortSignal.timeout(60000), // 1 minute timeout
        });

        if (!response.ok) {
            throw new Error(`Python service returned ${response.status}`);
        }

        const data = await response.json() as EmbeddingsResponse;

        if (!data.success || !data.embeddings) {
            throw new Error(data.error || 'Embeddings generation failed');
        }

        return data.embeddings;
    } catch (error) {
        logger.error({ error }, 'Failed to generate embeddings via Python service');
        throw error;
    }
};

/**
 * Check if Python service is healthy
 */
export const checkHealth = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${env.PYTHON_SERVICE_URL}/health`, {
            signal: AbortSignal.timeout(5000),
        });
        return response.ok;
    } catch (error) {
        logger.warn({ error }, 'Python service health check failed');
        return false;
    }
};
