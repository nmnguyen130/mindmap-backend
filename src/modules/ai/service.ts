import { env } from '@/config/env'
import OpenAI from 'openai'
import { supabaseAdmin } from '@/config/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

const client = new OpenAI({
  apiKey: env.openrouterApiKey,
  baseURL: 'https://openrouter.ai/api/v1'
})

// Model configuration
const AI_MODEL = 'openai/gpt-oss-20b:free'

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const { default: pdfParse } = await import('pdf-parse') as any
  const data = await pdfParse(buffer)
  return data.text
}

async function chunkText(text: string, maxChunkSize = 1000): Promise<string[]> {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10)
  const chunks: string[] = []
  let currentChunk = ''

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkSize && currentChunk.trim()) {
      chunks.push(currentChunk.trim())
      currentChunk = sentence.trim()
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence.trim()
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim())
  if (chunks.length === 0) chunks.push(text.slice(0, maxChunkSize))
  return chunks
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    encoding_format: 'float'
  })
  return response.data.map((d: any) => d.embedding) as number[][]
}

export const aiService = {
  async generate(supabase: SupabaseClient, userId: string, input: { text?: string, fileId?: string }) {
    try {
      console.log('AI generate called with userId:', userId, 'input:', input)
      let context = ''
      let title = 'Generated Mind Map'

      // TODO: Handle file-based generation with RAG
      if (input.fileId) {
        // Get file info and process for RAG
        const { data: file, error: fileError } = await supabase
          .from('files')
          .select('path')
          .eq('id', input.fileId)
          .single()

        if (fileError || !file) throw new Error('File not found')

        title = file.path.split('/').pop()?.replace(/\.[^/.]+$/, '') || title

        // TODO: Get relevant chunks using vector search function
        // const { data: chunks, error: chunksError } = await supabase
        //   .rpc('find_similar_chunks', {
        //     query_embedding: (await getEmbeddings([input.text || 'Generate mindmap']))[0],
        //     file_id: input.fileId,
        //     top_k: 5
        //   })

        // if (chunksError) throw chunksError

        // context = chunks?.map((c: any) => c.content).join('\n\n') || file.path
        context = file.path // Dummy context for now
      } else if (input.text) {
        context = input.text
        title = input.text.split(' ').slice(0, 3).join(' ')
      }

      // TODO: Generate mindmap structure using AI
      // Commented out for testing DB insertion
      /*
      const completion = await client.chat.completions.create({
        model: AI_MODEL,
        messages: [{
          role: 'user',
          content: `Create a hierarchical mindmap from this content. Return valid JSON with "title" and "nodes" array. Each node has "id" (string), "text", "position": {"x": number, "y": number}, "connections": []. Root at center {0,0}.

Content: ${context}

Return only valid JSON, no markdown or explanation.`
        }],
        temperature: 0.7,
        max_tokens: 2000
      })

      const content = completion.choices[0]?.message?.content?.trim()
      if (!content || !content.startsWith('{')) throw new Error('No valid JSON response from AI')

      // Clean the response (remove potential markdown code blocks)
      const jsonStr = content.replace(/^```json\n?/, '').replace(/\n?```$/, '')
      const result = JSON.parse(jsonStr)
      */

      // Dummy data for testing
      const result = {
        title: title,
        nodes: [
          {
            id: 'node-1',
            text: 'Central Topic',
            position: { x: 0, y: 0 },
            connections: ['node-2', 'node-3']
          },
          {
            id: 'node-2',
            text: 'Main Branch 1',
            position: { x: 200, y: -100 },
            connections: []
          },
          {
            id: 'node-3',
            text: 'Main Branch 2',
            position: { x: -200, y: -100 },
            connections: []
          }
        ]
      }

      // Save generated mindmap
      const mindmapData = {
        owner_id: userId,
        title: result.title || title,
        nodes: result.nodes || [],
        source_file_id: input.fileId
      }

      // Check auth context first
      console.log('Checking auth context...')
      try {
        const { data: authData, error: authError } = await supabase
          .from('auth.users')
          .select('id')
          .eq('id', userId) // Check if user exists
          .single()
        console.log('Auth user check:', { authData, authError })
      } catch (e) {
        console.log('Error checking auth user:', e)
      }

      // Try to get JWT claims directly
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        console.log('JWT user data:', userData?.user?.id, 'error:', userError)
      } catch (jwtError) {
        console.log('JWT error:', jwtError)
      }

      // Check auth.uid() directly via raw query
      console.log('Checking auth.uid() with raw query...')
      try {
        const { data: uidData, error: uidError } = await supabase.rpc('get_uid_test')
        console.log('auth.uid() result:', { uid: uidData, error: uidError })
      } catch (e) {
        console.log('Error calling get_uid_test:', e)
      }

      // Try with user client only
      console.log('Attempting insert with user client, mindmapData:', mindmapData)
      const insertResult = await supabase
        .from('mindmaps')
        .insert(mindmapData)
        .select()
        .single()

      if (insertResult.error) {
        console.error('User client insert failed:', insertResult.error)
        throw insertResult.error
      }

      const { data: mindmap, error: insertError } = insertResult
      if (insertError) throw insertError

      return {
        id: mindmap.id,
        title: mindmap.title,
        nodes: mindmap.nodes
      }
    } catch (error) {
      console.error('AI generate error:', error)
      throw new Error(`Failed to generate mindmap: ${(error as Error).message}`)
    }
  },

  async chat(supabase: SupabaseClient, mindmapId: string, message: string) {
    try {
      let context = ''

      // Get mindmap and related document chunks
      const { data: mindmap, error: mindmapError } = await supabase
        .from('mindmaps')
        .select('source_file_id, nodes')
        .eq('id', mindmapId)
        .single()

      if (mindmapError || !mindmap) throw new Error('Mindmap not found')

      if (mindmap.source_file_id) {
        // TODO: Get similar chunks for RAG
        // const { data: chunks } = await supabase.rpc('find_similar_chunks', {
        //   query_embedding: (await getEmbeddings([message]))[0],
        //   file_id: mindmap.source_file_id,
        //   top_k: 3
        // })
        // context = chunks?.map((c: any) => c.content).join('\n\n') || ''
        context = 'Dummy context from file'
      } else {
        context = mindmap.nodes.map((n: any) => n.text).join('\n')
      }

      // TODO: Generate AI chat response
      // const completion = await client.chat.completions.create({
      //   model: AI_MODEL,
      //   messages: [{
      //     role: 'system',
      //     content: 'You are a helpful assistant answering questions about mindmaps and documents. Use the provided context to give accurate, concise answers.'
      //   }, {
      //     role: 'user',
      //     content: `Context: ${context}\n\nQuestion: ${message}`
      //   }],
      //   temperature: 0.3,
      //   max_tokens: 1000
      // })

      const answer = 'This is a dummy response for testing purposes.'

      // Store chat message
      const { error: chatError } = await supabase
        .from('ai_chat_messages')
        .insert({
          session_id: mindmapId,
          role: 'user',
          content: message
        })

      const { error: responseError } = await supabase
        .from('ai_chat_messages')
        .insert({
          session_id: mindmapId,
          role: 'assistant',
          content: answer
        })

      if (chatError || responseError) {
        console.error('Failed to store chat:', chatError || responseError)
      }

      return { answer, sources: [] }
    } catch (error) {
      console.error('AI chat error:', error)
      throw new Error(`Failed to process question: ${(error as Error).message}`)
    }
  },

  async processPDF(fileId: string, buffer: Buffer, supabase: SupabaseClient, userId: string): Promise<void> {
    try {
      // Extract text from PDF
      const text = await extractTextFromPDF(buffer)
      if (!text || text.length < 10) throw new Error('No readable text found in PDF')

      // TODO: Chunk the text and generate embeddings
      // const chunks = await chunkText(text)
      // const embeddings = await getEmbeddings(chunks)

      // Store chunks in database (dummy for now)
      const dbRecords = [{
        file_id: fileId,
        mindmap_id: null, // Will be set when mindmap is created
        user_id: userId,
        content: text.slice(0, 1000), // Just store first 1000 chars for now
        embedding: null, // No embedding for now
        start_page: 1,
        end_page: 1,
        chunk_index: 0
      }]

      const { error } = await supabase
        .from('document_chunks')
        .insert(dbRecords)

      if (error) throw error
    } catch (error) {
      console.error('PDF processing error:', error)
      throw new Error(`Failed to process PDF: ${(error as Error).message}`)
    }
  },

  async suggest(supabase: SupabaseClient, mindmapId: string) {
    try {
      const { data: mindmap, error } = await supabase
        .from('mindmaps')
        .select('nodes')
        .eq('id', mindmapId)
        .single()

      if (error || !mindmap) throw new Error('Mindmap not found')

      const completion = await client.chat.completions.create({
        model: AI_MODEL,
        messages: [{
          role: 'user',
          content: `Analyze this mindmap and suggest improvements for structure, clarity, and comprehensiveness. Return 3-5 specific suggestions.

Mindmap nodes: ${JSON.stringify(mindmap.nodes)}

Return suggestions as a JSON array of strings.`
        }],
        temperature: 0.5
      })

      const response = completion.choices[0]?.message?.content
      const suggestions = response ? JSON.parse(response.replace(/^```json\n?/, '').replace(/\n?```$/, '')) : []

      return Array.isArray(suggestions) ? suggestions : ['Add more details', 'Organize hierarchically', 'Consider cross-connections']
    } catch (error) {
      console.error('AI suggest error:', error)
      return ['Consider adding more specific nodes', 'Organize content hierarchically', 'Add connections between related concepts']
    }
  },

  async analyze(supabase: SupabaseClient, mindmapId: string) {
    try {
      const { data: mindmap, error } = await supabase
        .from('mindmaps')
        .select('nodes')
        .eq('id', mindmapId)
        .single()

      if (error || !mindmap) throw new Error('Mindmap not found')

      const completion = await client.chat.completions.create({
        model: AI_MODEL,
        messages: [{
          role: 'user',
          content: `Analyze this mindmap structure and provide insights about its organization, completeness, and potential areas for improvement.

Mindmap: ${JSON.stringify(mindmap.nodes)}

Provide a comprehensive analysis covering:
1. Structural organization
2. Content completeness
3. Areas for expansion
4. Suggestions for optimization

Keep the analysis to 200-300 words.`
        }],
        temperature: 0.4,
        max_tokens: 500
      })

      return completion.choices[0]?.message?.content || 'Analysis could not be generated'
    } catch (error) {
      console.error('AI analyze error:', error)
      return 'Unable to analyze mindmap due to technical issues'
    }
  },

  async summarize(supabase: SupabaseClient, mindmapId: string) {
    try {
      const { data: mindmap, error } = await supabase
        .from('mindmaps')
        .select('title, nodes')
        .eq('id', mindmapId)
        .single()

      if (error || !mindmap) throw new Error('Mindmap not found')

      const completion = await client.chat.completions.create({
        model: AI_MODEL,
        messages: [{
          role: 'user',
          content: `Create a concise summary of this mindmap in 50-100 words.

Mindmap Title: ${mindmap.title}
Nodes: ${mindmap.nodes.map((n: any) => n.text).join(', ')}

Keep the summary clear and capture the main themes and structure.`
        }],
        temperature: 0.3,
        max_tokens: 150
      })

      return completion.choices[0]?.message?.content || 'Summary could not be generated'
    } catch (error) {
      console.error('AI summarize error:', error)
      return 'Unable to summarize mindmap due to technical issues'
    }
  },

  async convert(supabase: SupabaseClient, mindmapId: string, format: string) {
    try {
      const { data: mindmap, error } = await supabase
        .from('mindmaps')
        .select('title, nodes')
        .eq('id', mindmapId)
        .single()

      if (error || !mindmap) throw new Error('Mindmap not found')

      if (format === 'markdown') {
        const completion = await client.chat.completions.create({
          model: AI_MODEL,
          messages: [{
            role: 'user',
            content: `Convert this mindmap to Markdown format with proper headings and bullet points.

Mindmap Title: ${mindmap.title}
Nodes: ${JSON.stringify(mindmap.nodes)}

Create a hierarchical Markdown structure.`
          }],
          temperature: 0.2
        })

        const content = completion.choices[0]?.message?.content || ''
        return { content, format: 'markdown' }
      }

      throw new Error(`Format '${format}' not supported`)
    } catch (error) {
      console.error('AI convert error:', error)
      throw new Error(`Failed to convert mindmap: ${(error as Error).message}`)
    }
  }
}
