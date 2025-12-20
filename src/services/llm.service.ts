import { openai, OPENAI_CONFIG } from "@/config/openai";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

/**
 * LLM Provider Interface
 */
export interface LLMProvider {
  generateCompletion(
    prompt: string,
    options?: CompletionOptions
  ): Promise<string>;
}

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * OpenAI Provider Implementation
 */
class OpenAIProvider implements LLMProvider {
  async generateCompletion(
    prompt: string,
    options: CompletionOptions = {}
  ): Promise<string> {
    const {
      maxTokens = OPENAI_CONFIG.maxTokens,
      temperature = OPENAI_CONFIG.temperature,
      systemPrompt = "You are a helpful AI assistant.",
    } = options;

    try {
      const response = await openai.chat.completions.create({
        model: OPENAI_CONFIG.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature,
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      logger.error({ error }, "OpenAI completion failed");
      throw new Error("Failed to generate completion from OpenAI");
    }
  }
}

/**
 * Ollama Provider Implementation (Future Support)
 * Uncomment and configure when ready to use local LLM
 */
// class OllamaProvider implements LLMProvider {
//     private baseUrl: string;
//     private model: string;
//
//     constructor(baseUrl: string, model: string) {
//         this.baseUrl = baseUrl;
//         this.model = model;
//     }
//
//     async generateCompletion(
//         prompt: string,
//         options: CompletionOptions = {}
//     ): Promise<string> {
//         const {
//             maxTokens = 2000,
//             temperature = 0.7,
//             systemPrompt = 'You are a helpful AI assistant.',
//         } = options;
//
//         try {
//             const response = await fetch(`${this.baseUrl}/api/generate`, {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify({
//                     model: this.model,
//                     prompt: `${systemPrompt}\n\n${prompt}`,
//                     options: {
//                         num_predict: maxTokens,
//                         temperature,
//                     },
//                 }),
//             });
//
//             const data = await response.json();
//             return data.response || '';
//         } catch (error) {
//             logger.error({ error }, 'Ollama completion failed');
//             throw new Error('Failed to generate completion from Ollama');
//         }
//     }
// }

/**
 * LLM Service Factory
 */
class LLMService {
  private provider: LLMProvider;

  constructor() {
    // For now, default to OpenAI
    // Future: Check env.AI_PROVIDER to switch between 'openai' and 'ollama'
    this.provider = new OpenAIProvider();

    // Example for future Ollama support:
    // if (env.AI_PROVIDER === 'ollama') {
    //     this.provider = new OllamaProvider(env.OLLAMA_BASE_URL, env.OLLAMA_MODEL);
    // } else {
    //     this.provider = new OpenAIProvider();
    // }
  }

  /**
   * Generate text completion
   */
  async generateCompletion(
    prompt: string,
    options?: CompletionOptions
  ): Promise<string> {
    return this.provider.generateCompletion(prompt, options);
  }

  /**
   * Analyze PDF content and generate mindmap structure
   */
  async analyzePdfForMindmap(
    content: string,
    fileName?: string
  ): Promise<MindmapAnalysis> {
    const systemPrompt = `You are an expert at analyzing documents and creating structured mindmaps. 
Your task is to analyze the provided document content and extract:
1. A central topic (main theme of the document)
2. Key topics organized hierarchically
3. Important keywords for each topic
4. Relationships between topics

Return the analysis as a valid JSON object with the following structure:
{
  "title": "Document title or main topic",
  "central_topic": "Main theme",
  "summary": "Brief 2-3 sentence overview",
  "nodes": [
    {
      "id": "node-0",
      "label": "Topic name",
      "keywords": ["keyword1", "keyword2"],
      "level": 0,
      "parent_id": null
    }
  ],
  "edges": [
    {
      "from": "node-0",
      "to": "node-1",
      "relationship": "describes"
    }
  ]
}

Rules:
- Level 0 is the central node
- Level 1 nodes are main categories
- Level 2+ are subtopics
- Include 3-7 keywords per node
- Create clear parent-child relationships
- Use meaningful relationship labels (describes, contains, explains, etc.)
- Return ONLY valid JSON, no markdown or extra text`;

    const userPrompt = `Analyze this document${
      fileName ? ` titled "${fileName}"` : ""
    } and create a mindmap:

${content.slice(0, 15000)}${
      content.length > 15000 ? "\n\n[Content truncated for analysis]" : ""
    }

Remember: Return ONLY the JSON object, nothing else.`;

    try {
      const response = await this.generateCompletion(userPrompt, {
        systemPrompt,
        maxTokens: 3000,
        temperature: 0.7,
      });

      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response;
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch?.[1]) {
        jsonStr = codeBlockMatch[1].trim();
      } else {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
      }

      if (!jsonStr.startsWith("{")) {
        throw new Error("No valid JSON found in LLM response");
      }

      const analysis = JSON.parse(jsonStr) as MindmapAnalysis;

      // Validate and normalize structure
      if (!analysis.nodes || !Array.isArray(analysis.nodes)) {
        throw new Error("Invalid mindmap structure: missing nodes array");
      }

      // Ensure edges array exists (LLM may omit it)
      if (!analysis.edges) {
        analysis.edges = [];
      }

      return analysis;
    } catch (error) {
      logger.error({ error }, "Failed to analyze PDF for mindmap");
      throw new Error("Failed to generate mindmap from document");
    }
  }
}

/**
 * Mindmap Analysis Result Interface
 */
export interface MindmapNode {
  id: string;
  label: string;
  keywords: string[];
  level: number;
  parent_id: string | null;
}

export interface MindmapEdge {
  from: string;
  to: string;
  relationship?: string;
}

export interface MindmapAnalysis {
  title: string;
  central_topic: string;
  summary?: string;
  nodes: MindmapNode[];
  edges: MindmapEdge[];
}

// Export singleton instance
export const llmService = new LLMService();
