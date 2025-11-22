import { llmService, MindmapAnalysis } from '@/services/llm.service';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import pdfParse from 'pdf-parse-new';

/**
 * Generate mindmap from PDF file
 */
export const generateMindmapFromPdf = async (
    fileBuffer: Buffer,
    fileName: string
): Promise<MindmapAnalysis> => {
    try {
        // Validate file type
        if (!fileName.toLowerCase().endsWith('.pdf')) {
            throw new ValidationError('Only PDF files are supported');
        }

        // Extract text from PDF
        let pdfText = '';

        // Suppress pdf-parse warnings
        const originalWrite = process.stdout.write;
        process.stdout.write = ((chunk: any, encoding?: any, callback?: any): boolean => {
            const message = chunk.toString();
            if (message.includes('TT: CALL') || message.includes('Info:')) {
                if (typeof encoding === 'function') {
                    encoding();
                } else if (typeof callback === 'function') {
                    callback();
                }
                return true;
            }
            return originalWrite.call(process.stdout, chunk, encoding, callback);
        }) as any;

        try {
            const pdfData = await pdfParse(fileBuffer);
            pdfText = pdfData.text;
        } finally {
            process.stdout.write = originalWrite;
        }

        // Validate content
        if (!pdfText || pdfText.trim().length === 0) {
            throw new ValidationError('PDF contains no extractable text');
        }

        if (pdfText.trim().length < 100) {
            throw new ValidationError('PDF content too short to generate meaningful mindmap');
        }

        logger.info(`Extracted ${pdfText.length} characters from PDF: ${fileName}`);

        // Generate mindmap using LLM
        const mindmapData = await llmService.analyzePdfForMindmap(pdfText, fileName);

        logger.info(`Generated mindmap with ${mindmapData.nodes.length} nodes for: ${fileName}`);

        return mindmapData;
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }
        logger.error({ error, fileName }, 'Failed to generate mindmap from PDF');
        throw new Error('Failed to process PDF and generate mindmap');
    }
};

/**
 * Generate mindmap from plain text
 */
export const generateMindmapFromText = async (
    text: string,
    title?: string
): Promise<MindmapAnalysis> => {
    try {
        // Validate content
        if (!text || text.trim().length === 0) {
            throw new ValidationError('Text content is empty');
        }

        if (text.trim().length < 100) {
            throw new ValidationError('Text content too short to generate meaningful mindmap');
        }

        logger.info(`Generating mindmap from ${text.length} characters of text`);

        // Generate mindmap using LLM
        const mindmapData = await llmService.analyzePdfForMindmap(text, title);

        logger.info(`Generated mindmap with ${mindmapData.nodes.length} nodes`);

        return mindmapData;
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }
        logger.error({ error }, 'Failed to generate mindmap from text');
        throw new Error('Failed to process text and generate mindmap');
    }
};
