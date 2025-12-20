import { createSupabaseClient } from "@/config/supabase";
import { EmbeddingService } from "@/services/embedding.service";
import { logger } from "@/utils/logger";

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
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const maxChunkSize = 1000;
  const sections: string[] = [];
  let currentSection = "";

  for (const paragraph of paragraphs) {
    if (
      currentSection.length + paragraph.length > maxChunkSize &&
      currentSection.length > 0
    ) {
      sections.push(currentSection);
      currentSection = paragraph;
    } else {
      currentSection += (currentSection ? "\n\n" : "") + paragraph;
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections.length > 0 ? sections : [text];
}

/**
 * Generate embeddings for sections asynchronously (optimized batch processing)
 */
export async function generateEmbeddings(
  params: ServiceParams<{
    sectionIds: string[];
  }>
): Promise<void> {
  const { userId, accessToken, sectionIds } = params;
  const supabase = createSupabaseClient(accessToken);

  // Fetch sections that need embeddings
  const { data: sections, error: selectError } = await supabase
    .from("document_sections")
    .select("id, content")
    .in("id", sectionIds)
    .is("embedding", null);

  if (selectError || !sections || sections.length === 0) {
    logger.error(
      { selectError, userId },
      "Failed to fetch sections for embedding"
    );
    return;
  }

  // Filter valid sections
  const validSections = sections.filter(
    (s) => s.content && s.content.trim().length > 0
  );
  if (validSections.length === 0) return;

  try {
    const startTime = Date.now();

    // Batch generate all embeddings at once (much faster than sequential)
    const contents = validSections.map((s) => s.content);
    const embeddings = await EmbeddingService.generateEmbeddings(contents);

    // Parallel update all sections
    const updatePromises = validSections.map((section, idx) =>
      supabase
        .from("document_sections")
        .update({ embedding: embeddings[idx] })
        .eq("id", section.id)
        .then(({ error }) => {
          if (error) {
            logger.error(
              { error, sectionId: section.id },
              "Failed to save embedding"
            );
          }
        })
    );

    await Promise.all(updatePromises);

    const duration = Date.now() - startTime;
    logger.info(
      { count: validSections.length, durationMs: duration },
      `Generated ${validSections.length} embeddings in ${duration}ms`
    );
  } catch (err) {
    logger.error({ err, userId }, "Batch embedding generation failed");
  }
}
