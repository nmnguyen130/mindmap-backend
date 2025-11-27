import pdfParse from 'pdf-parse-new';
import { createSupabaseClient } from '@/config/supabase';
import { EmbeddingService } from '@/services/embedding.service';
import { openai, OPENAI_CONFIG } from '@/config/openai';
import { logger } from '@/utils/logger';
import { ValidationError } from '@/utils/errors';
import { llmService, MindmapAnalysis } from '@/services/llm.service';

type ServiceParams<T = {}> = {
    userId: string;
    accessToken: string;
} & T;

/**
 * Split text into sections (paragraph-based chunking)
 * Shared utility for both document processing and mindmap creation
 */
export function splitIntoSections(text: string): string[] {
    const paragraphs = text
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

    const maxChunkSize = 1000;
    const sections: string[] = [];
    let currentSection = '';

    for (const paragraph of paragraphs) {
        if (currentSection.length + paragraph.length > maxChunkSize && currentSection.length > 0) {
            sections.push(currentSection);
            currentSection = paragraph;
        } else {
            currentSection += (currentSection ? '\n\n' : '') + paragraph;
        }
    }

    if (currentSection) {
        sections.push(currentSection);
    }

    return sections.length > 0 ? sections : [text];
}

/**
 * Generate embeddings for sections asynchronously
 * Shared utility for background embedding generation
 */
export async function generateEmbeddings(params: ServiceParams<{
    sectionIds: string[];
}>): Promise<void> {
    const { userId, accessToken, sectionIds } = params;
    const supabase = createSupabaseClient(accessToken);

    const { data: sections, error: selectError } = await supabase
        .from('document_sections')
        .select('id, content')
        .in('id', sectionIds)
        .is('embedding', null);

    if (selectError || !sections) {
        logger.error({ selectError, userId }, 'Failed to fetch sections for embedding');
        return;
    }

    for (const section of sections) {
        if (!section.content) continue;

        try {
            const embedding = await EmbeddingService.generateEmbedding(section.content);
            const { error: updateError } = await supabase
                .from('document_sections')
                .update({ embedding })
                .eq('id', section.id);

            if (updateError) {
                logger.error({ updateError, sectionId: section.id }, 'Failed to save embedding');
            }
        } catch (err) {
            logger.error({ err, sectionId: section.id }, 'Error generating embedding');
        }
    }
}