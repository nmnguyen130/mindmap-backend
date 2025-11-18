import { Request, Response } from 'express'
import { aiService } from '@/modules/ai/service'
import type { AuthedRequest } from '@/core/middlewares/auth'

export async function generate(req: AuthedRequest, res: Response) {
  try {
    const { text, fileId } = req.body
    if (!req.supabase) throw new Error('Database connection not available')
    if (!req.user?.id) throw new Error('User not authenticated')

    const data = await aiService.generate(req.supabase, req.user.id, { text, fileId })
    res.json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate mindmap' })
  }
}

export async function chat(req: AuthedRequest, res: Response) {
  try {
    const { mindMapId, message } = req.body
    if (!req.supabase) throw new Error('Database connection not available')

    const data = await aiService.chat(req.supabase, mindMapId, message)
    res.json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to process chat' })
  }
}

export async function suggest(req: AuthedRequest, res: Response) {
  try {
    const { mindMapId } = req.body
    if (!req.supabase) throw new Error('Database connection not available')

    const data = await aiService.suggest(req.supabase, mindMapId)
    res.json({ suggestions: data })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get suggestions' })
  }
}

export async function analyze(req: AuthedRequest, res: Response) {
  try {
    const { mindMapId } = req.body
    if (!req.supabase) throw new Error('Database connection not available')

    const data = await aiService.analyze(req.supabase, mindMapId)
    res.json({ analysis: data })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to analyze mindmap' })
  }
}

export async function summarize(req: AuthedRequest, res: Response) {
  try {
    const { mindMapId } = req.body
    if (!req.supabase) throw new Error('Database connection not available')

    const data = await aiService.summarize(req.supabase, mindMapId)
    res.json({ summary: data })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to summarize mindmap' })
  }
}

export async function convert(req: AuthedRequest, res: Response) {
  try {
    const { mindMapId, format = 'markdown' } = req.body
    if (!req.supabase) throw new Error('Database connection not available')

    const data = await aiService.convert(req.supabase, mindMapId, format)
    res.json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to convert mindmap' })
  }
}
