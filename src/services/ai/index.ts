import { env } from '../../config/env'

async function callEdge(path: string, body: unknown, token?: string) {
  const url = `${env.supabaseUrl}/functions/v1/${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`AI function failed: ${res.status}`)
  return res.json()
}

export const aiService = {
  generate: (input: { text?: string; filePath?: string }, token?: string) => callEdge('generate-mindmap', input, token),
  suggest: (input: { mindMapId: string; nodes: unknown[] }, token?: string) => callEdge('suggest', input, token),
  summarize: (input: { mindMapId: string; nodes: unknown[] }, token?: string) => callEdge('summarize', input, token),
  chat: (input: { mindMapId: string; message: string }, token?: string) => callEdge('chat', input, token),
  analyze: (input: { mindMapId: string; nodes: unknown[]; connections?: unknown[] }, token?: string) => callEdge('analyze-mindmap', input, token),
  convert: (input: { mindMapId: string; format: 'pdf' | 'markdown' }, token?: string) => callEdge('convert', input, token),
}
