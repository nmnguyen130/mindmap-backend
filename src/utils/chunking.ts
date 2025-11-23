/**
 * Unified Chunking Utility
 * Production 2025: Structure → Semantic → Window Chunking Pipeline
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { logger } from './logger';
import { env } from '@/config/env';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ChunkMetadata {
    section_heading: string;
    parent_section?: string;
    hierarchy_level: number;
    chunk_type: 'section' | 'semantic' | 'window';
    original_position: number;
}

export interface StructuredChunk {
    content: string;
    metadata: ChunkMetadata;
    window_context?: {
        before?: string;
        after?: string;
    };
}

export interface ChunkingOptions {
    maxChunkSize: number;
    windowOverlap: number;
    minSectionSize?: number;
}

interface ChunkOptions {
    chunkSize?: number;
    chunkOverlap?: number;
}

// ============================================================================
// Primary Export: Structured Chunking Pipeline (Production 2025)
// ============================================================================

/**
 * Main chunking pipeline: Structure → Semantic → Window
 * Industry standard for enterprise RAG systems
 */
export const structuredChunkPipeline = async (
    markdownContent: string,
    options: ChunkingOptions
): Promise<StructuredChunk[]> => {
    const { maxChunkSize, windowOverlap, minSectionSize = 200 } = options;

    logger.info('Starting structured chunking pipeline...');

    // Step 1: Extract sections from markdown
    const sections = extractSections(markdownContent);
    logger.debug(`Extracted ${sections.length} sections from markdown`);

    // Step 2: Process each section
    const allChunks: StructuredChunk[] = [];
    let globalPosition = 0;

    for (const section of sections) {
        const sectionChunks = await processSectionChunks(
            section,
            maxChunkSize,
            windowOverlap,
            minSectionSize,
            globalPosition
        );
        allChunks.push(...sectionChunks);
        globalPosition += sectionChunks.length;
    }

    // Step 3: Add window context (look before/after)
    const chunksWithWindows = addWindowContext(allChunks, windowOverlap);

    logger.info(`Structured chunking complete: ${chunksWithWindows.length} chunks`);
    return chunksWithWindows;
};

// ============================================================================
// Legacy Support: Sentence-based Chunking
// ============================================================================

/**
 * Split text into chunks at sentence boundaries for better semantic coherence
 * @deprecated Use structuredChunkPipeline for production. 
 * Kept for backward compatibility with rag/service.ts ingestDocument for TXT files.
 */
export const chunkTextBySentence = (
    text: string,
    options: ChunkOptions = {}
): string[] => {
    const chunkSize = options.chunkSize || env.CHUNK_SIZE;
    const chunkOverlap = options.chunkOverlap || env.CHUNK_OVERLAP;

    // Split by sentence
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length <= chunkSize) {
            currentChunk += sentence;
        } else {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks.filter((chunk) => chunk.length > 0);
};

// ============================================================================
// Internal Helpers
// ============================================================================

interface Section {
    heading: string;
    content: string;
    level: number;
    parent?: string;
}

/**
 * Extract sections from markdown based on headings
 */
function extractSections(markdown: string): Section[] {
    const lines = markdown.split('\n');
    const sections: Section[] = [];
    let currentSection: Section | null = null;
    let currentContent: string[] = [];
    const headingStack: Array<{ level: number; heading: string }> = [];

    for (const line of lines) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headingMatch) {
            // Save previous section if exists
            if (currentSection && currentContent.length > 0) {
                currentSection.content = currentContent.join('\n').trim();
                if (currentSection.content) {
                    sections.push(currentSection);
                }
            }

            // Parse new heading
            const level = headingMatch[1]!.length;
            const heading = headingMatch[2]!.trim();

            // Update heading stack (for parent tracking)
            while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
                headingStack.pop();
            }

            const parent = headingStack.length > 0 ? headingStack[headingStack.length - 1]!.heading : undefined;
            headingStack.push({ level, heading });

            // Create new section
            currentSection = {
                heading,
                content: '',
                level,
                parent,
            };
            currentContent = [];
        } else {
            // Add to current section content
            if (line.trim()) {
                currentContent.push(line);
            }
        }
    }

    // Save last section
    if (currentSection && currentContent.length > 0) {
        currentSection.content = currentContent.join('\n').trim();
        if (currentSection.content) {
            sections.push(currentSection);
        }
    }

    // If no sections found, create a single default section
    if (sections.length === 0 && markdown.trim()) {
        sections.push({
            heading: 'Document Content',
            content: markdown.trim(),
            level: 1,
        });
    }

    return sections;
}

/**
 * Process a section: split if too long, otherwise keep as single chunk
 */
async function processSectionChunks(
    section: Section,
    maxChunkSize: number,
    overlap: number,
    minSectionSize: number,
    startPosition: number
): Promise<StructuredChunk[]> {
    const chunks: StructuredChunk[] = [];

    // If section is small enough, keep as single chunk
    if (section.content.length <= maxChunkSize) {
        chunks.push({
            content: section.content,
            metadata: {
                section_heading: section.heading,
                parent_section: section.parent,
                hierarchy_level: section.level,
                chunk_type: 'section',
                original_position: startPosition,
            },
        });
    } else {
        // Section is too long → semantic chunking
        const subChunks = await splitSemanticChunks(section.content, {
            maxChunkSize,
            overlap,
        });

        for (let i = 0; i < subChunks.length; i++) {
            chunks.push({
                content: subChunks[i]!,
                metadata: {
                    section_heading: section.heading,
                    parent_section: section.parent,
                    hierarchy_level: section.level,
                    chunk_type: 'semantic',
                    original_position: startPosition + i,
                },
            });
        }
    }

    return chunks;
}

/**
 * Split text using semantic boundaries
 * Uses LangChain's RecursiveCharacterTextSplitter for intelligent splitting
 */
async function splitSemanticChunks(
    text: string,
    options: { maxChunkSize: number; overlap: number }
): Promise<string[]> {
    const { maxChunkSize, overlap } = options;

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: maxChunkSize,
        chunkOverlap: overlap,
        separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ', ''],
        keepSeparator: true,
    });

    try {
        const chunks = await splitter.splitText(text);
        logger.debug(`Semantic split: ${text.length} chars → ${chunks.length} chunks`);
        return chunks.filter((c) => c.trim().length > 0);
    } catch (error) {
        logger.error({ error }, 'Semantic splitting failed, using fallback');
        return fallbackSentenceSplit(text, maxChunkSize, overlap);
    }
}

/**
 * Fallback sentence-based splitter
 */
function fallbackSentenceSplit(text: string, maxSize: number, overlap: number): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length <= maxSize) {
            currentChunk += sentence;
        } else {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks.filter((c) => c.length > 0);
}

/**
 * Add window context (snippets from adjacent chunks)
 */
function addWindowContext(chunks: StructuredChunk[], windowSize: number): StructuredChunk[] {
    return chunks.map((chunk, index) => {
        const windowBefore =
            index > 0 ? chunks[index - 1]!.content.slice(-windowSize) : undefined;
        const windowAfter =
            index < chunks.length - 1 ? chunks[index + 1]!.content.slice(0, windowSize) : undefined;

        return {
            ...chunk,
            window_context: {
                before: windowBefore,
                after: windowAfter,
            },
        };
    });
}
