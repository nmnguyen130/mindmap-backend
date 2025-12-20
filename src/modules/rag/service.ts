import pdfParse from "pdf-parse-new";
import { createSupabaseClient } from "@/config/supabase";
import { openai, OPENAI_CONFIG } from "@/config/openai";
import { EmbeddingService } from "@/services/embedding.service";
import * as storageService from "@/services/storage.service";
import { llmService } from "@/services/llm.service";
import {
  createMindmap,
  Mindmap,
  NodeInput,
  ConnectionInput,
} from "@/modules/mindmaps/service";
import { NotFoundError, ValidationError } from "@/utils/errors";
import { logger } from "@/utils/logger";
import { splitIntoSections, generateEmbeddings } from "./helpers";

export interface DocumentSection {
  id: string;
  document_id: string;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  created_at: number;
}

export interface Document {
  id: string;
  name: string;
  storage_object_id: string;
  created_by: string;
  created_at: number;
}

interface MindmapResult {
  id: string;
  title: string;
  mindmap_data: {
    central_topic: string;
    summary?: string;
    nodes: Array<{
      id: string;
      label: string;
      keywords: string[];
      level: number;
      parent_id: string | null;
    }>;
    edges: Array<{
      id: string;
      from: string;
      to: string;
      relationship?: string;
    }>;
  };
}

interface CreateDocumentResult {
  document: Document;
  sections_count: number;
  mindmap?: MindmapResult;
}

type ServiceParams<T = object> = {
  userId: string;
  accessToken: string;
} & T;

/**
 * Create document from PDF with optional mindmap generation.
 * Workflow: Parse PDF → Upload to storage → Create document → Generate embeddings → Create mindmap
 */
export const createDocumentFromPdf = async (
  params: ServiceParams<{
    fileBuffer: Buffer;
    fileName: string;
    title?: string;
    generateMindmap?: boolean;
  }>
): Promise<CreateDocumentResult> => {
  const {
    userId,
    accessToken,
    fileBuffer,
    fileName,
    title,
    generateMindmap = false,
  } = params;
  const supabase = createSupabaseClient(accessToken);

  // Validate file type
  if (!fileName.toLowerCase().endsWith(".pdf")) {
    throw new ValidationError("Only PDF files are supported");
  }

  try {
    logger.info({ userId, fileName, generateMindmap }, "Processing PDF upload");

    // Step 1: Parse PDF
    const pdfData = await pdfParse(fileBuffer);
    const pdfText = pdfData.text.trim();

    if (!pdfText) {
      throw new ValidationError("PDF contains no extractable text");
    }

    // Step 2: Upload to storage
    const { id: storageId } = await storageService.uploadFile(
      userId,
      fileBuffer,
      fileName,
      "application/pdf"
    );

    // Step 3: Create document record
    const documentName = title || fileName;
    const { data: document, error: docError } = await supabase
      .from("documents")
      .insert({
        name: documentName,
        storage_object_id: storageId,
        created_by: userId,
      })
      .select()
      .single();

    if (docError || !document) {
      logger.error({ docError, userId }, "Failed to create document");
      throw new Error(`Failed to create document: ${docError?.message}`);
    }

    // Step 4: Split and insert sections
    const textSections = splitIntoSections(pdfText);
    const sectionRows = textSections.map((content, idx) => ({
      document_id: document.id,
      content,
      metadata: {
        source: fileName,
        page_count: pdfData.numpages,
        section_index: idx,
      },
    }));

    const { data: insertedSections, error: sectionsError } = await supabase
      .from("document_sections")
      .insert(sectionRows)
      .select("id");

    if (sectionsError || !insertedSections) {
      throw new Error(`Failed to create sections: ${sectionsError?.message}`);
    }

    // Step 5: Generate embeddings in background
    generateEmbeddings({
      userId,
      accessToken,
      sectionIds: insertedSections.map((s) => s.id),
    }).catch((err) =>
      logger.error(
        { err, documentId: document.id },
        "Embedding generation failed"
      )
    );

    const result: CreateDocumentResult = {
      document: document as Document,
      sections_count: insertedSections.length,
    };

    // Step 6: Generate mindmap if requested
    if (generateMindmap) {
      result.mindmap = await createMindmapFromPdf({
        userId,
        accessToken,
        documentId: document.id,
        pdfText,
        fileName,
        title,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    logger.error({ error, userId, fileName }, "PDF upload failed");
    throw new Error("Failed to process PDF");
  }
};

/**
 * Create mindmap from PDF text using LLM analysis and mindmaps service.
 */
async function createMindmapFromPdf(params: {
  userId: string;
  accessToken: string;
  documentId: string;
  pdfText: string;
  fileName: string;
  title?: string;
}): Promise<MindmapResult> {
  const { userId, accessToken, documentId, pdfText, fileName, title } = params;

  // Analyze document with LLM
  const analysis = await llmService.analyzePdfForMindmap(pdfText, fileName);
  logger.info({ nodeCount: analysis.nodes.length }, "LLM analysis complete");

  // Create ID mapping: LLM node ID → real UUID
  const idMap = new Map<string, string>();
  for (const node of analysis.nodes) {
    idMap.set(node.id, crypto.randomUUID());
  }

  // Transform nodes for database (NodeInput) and response (mindmap_data.nodes)
  const mappedNodes = analysis.nodes.map((node) => {
    const mappedId = idMap.get(node.id)!;
    const mappedParentId = node.parent_id
      ? idMap.get(node.parent_id) || null
      : null;
    return {
      id: mappedId,
      label: node.label,
      keywords: node.keywords || [],
      level: node.level,
      parent_id: mappedParentId,
    };
  });

  // Transform edges for database (ConnectionInput) and response (mindmap_data.edges)
  const mappedEdges = (analysis.edges || [])
    .filter((edge) => idMap.has(edge.from) && idMap.has(edge.to))
    .map((edge) => ({
      id: crypto.randomUUID(),
      from: idMap.get(edge.from)!,
      to: idMap.get(edge.to)!,
      relationship: edge.relationship || undefined,
    }));

  // Convert to service input format
  const nodesInput: NodeInput[] = mappedNodes.map((n) => ({
    id: n.id,
    label: n.label,
    keywords: n.keywords,
    level: n.level,
    parent_id: n.parent_id,
    position_x: 0,
    position_y: 0,
    notes: null,
  }));

  const connectionsInput: ConnectionInput[] = mappedEdges.map((e) => ({
    id: e.id,
    from_node_id: e.from,
    to_node_id: e.to,
    relationship: e.relationship ?? null,
  }));

  // Use createMindmap service (DRY)
  const mindmap = await createMindmap({
    userId,
    accessToken,
    title: title || analysis.title,
    central_topic: analysis.central_topic,
    summary: analysis.summary,
    document_id: documentId,
    nodes: nodesInput,
    connections: connectionsInput,
  });

  logger.info({ mindmapId: mindmap.id, documentId }, "Mindmap created");

  // Return format that frontend expects (reuse already-mapped data)
  return {
    id: mindmap.id,
    title: mindmap.title,
    mindmap_data: {
      central_topic: analysis.central_topic,
      summary: analysis.summary,
      nodes: mappedNodes,
      edges: mappedEdges,
    },
  };
}

/**
 * Chat with RAG context (streaming)
 */
export async function* ragChat(
  params: ServiceParams<{
    question: string;
    documentId?: string;
    matchThreshold: number;
    matchCount: number;
  }>
): AsyncGenerator<string, void, unknown> {
  const {
    userId,
    accessToken,
    question,
    documentId,
    matchThreshold,
    matchCount,
  } = params;
  const supabase = createSupabaseClient(accessToken);

  logger.debug(
    { matchThreshold, matchCount, documentId },
    "RAG Chat parameters"
  );

  // Generate embedding for the question
  const questionEmbedding = await EmbeddingService.generateEmbedding(question);

  // Search for similar sections using match_document_sections
  const { data, error: matchError } = await supabase
    .rpc("match_document_sections", {
      query_embedding: questionEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter_document_id: documentId || null,
    })
    .select("content");

  if (matchError) {
    logger.error(
      { matchError, userId, question },
      "Error matching document sections"
    );
    throw new Error(
      "There was an error reading your documents, please try again."
    );
  }

  const documents = (data || []) as Array<{ content: string }>;

  // Build context from matched documents
  const injectedDocs =
    documents.length > 0
      ? documents.map(({ content }) => content).join("\n\n")
      : "No documents found";

  logger.info(
    { userId, question, matchedDocs: documents.length },
    "RAG context built"
  );

  // Build messages for OpenAI
  const completionMessages = [
    {
      role: "user" as const,
      content: `You're an AI assistant who answers questions about documents.

                You're a chat bot, so keep your replies succinct.

                You're only allowed to use the documents below to answer the question.

                If the question isn't related to these documents, say:
                "Sorry, I couldn't find any information on that."

                If the information isn't available in the below documents, say:
                "Sorry, I couldn't find any information on that."

                Do not go off topic.

                Documents:
                ${injectedDocs}
            `,
    },
    {
      role: "user" as const,
      content: question,
    },
  ];

  // Stream response from OpenAI
  const completionStream = await openai.chat.completions.create({
    model: OPENAI_CONFIG.chatModel,
    messages: completionMessages,
    max_tokens: OPENAI_CONFIG.maxTokens,
    temperature: 0,
    stream: true,
  });

  for await (const chunk of completionStream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      yield content;
    }
  }
}

/**
 * List user's documents
 */
export const listDocuments = async (
  params: ServiceParams
): Promise<Document[]> => {
  const { userId, accessToken } = params;
  const supabase = createSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error({ error, userId }, "Failed to list documents");
    throw new Error("Failed to list documents");
  }

  return data || [];
};

/**
 * Get document with sections
 */
export const getDocument = async (
  params: ServiceParams<{
    documentId: string;
  }>
): Promise<Document & { sections: DocumentSection[] }> => {
  const { userId, accessToken, documentId } = params;
  const supabase = createSupabaseClient(accessToken);

  // Get document
  const { data: document, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("created_by", userId)
    .single();

  if (docError || !document) {
    logger.error({ docError, userId, documentId }, "Document not found");
    throw new NotFoundError("Document not found");
  }

  // Get sections
  const { data: sections, error: sectionsError } = await supabase
    .from("document_sections")
    .select("*")
    .eq("document_id", documentId)
    .order("id", { ascending: true });

  if (sectionsError) {
    logger.error(
      { sectionsError, userId, documentId },
      "Failed to get sections"
    );
    throw new Error("Failed to retrieve sections");
  }

  return {
    ...document,
    sections: (sections as DocumentSection[]) || [],
  };
};

/**
 * Delete document (cascades to sections)
 */
export const deleteDocument = async (
  params: ServiceParams<{
    documentId: string;
  }>
): Promise<void> => {
  const { userId, accessToken, documentId } = params;
  const supabase = createSupabaseClient(accessToken);

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("created_by", userId);

  if (error) {
    logger.error({ error, userId, documentId }, "Failed to delete document");
    throw new Error("Failed to delete document");
  }

  logger.info({ userId, documentId }, "Document deleted successfully");
};
