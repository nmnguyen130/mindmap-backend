import { Request, Response } from 'express'
import { aiService } from '@/modules/ai/service'
import { extractBearerToken } from '@/core/middlewares/auth'

export async function generate(req: Request, res: Response) {
  const data = await aiService.generate(req.body, extractBearerToken(req))
  res.json(data)
}

export async function suggest(req: Request, res: Response) {
  const data = await aiService.suggest(req.body, extractBearerToken(req))
  res.json(data)
}

export async function summarize(req: Request, res: Response) {
  const data = await aiService.summarize(req.body, extractBearerToken(req))
  res.json(data)
}

export async function chat(req: Request, res: Response) {
  const data = await aiService.chat(req.body, extractBearerToken(req))
  res.json(data)
}

export async function analyze(req: Request, res: Response) {
  const data = await aiService.analyze(req.body, extractBearerToken(req))
  res.json(data)
}

export async function convert(req: Request, res: Response) {
  const data = await aiService.convert(req.body, extractBearerToken(req))
  res.json(data)
}
