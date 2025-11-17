import { Request, Response } from 'express'
import { aiService } from '@/modules/ai/service'

export async function generate(req: Request, res: Response) {
  const data = await aiService.generate(req.body, req.headers.authorization?.split(' ')[1])
  res.json(data)
}

export async function suggest(req: Request, res: Response) {
  const data = await aiService.suggest(req.body, req.headers.authorization?.split(' ')[1])
  res.json(data)
}

export async function summarize(req: Request, res: Response) {
  const data = await aiService.summarize(req.body, req.headers.authorization?.split(' ')[1])
  res.json(data)
}

export async function chat(req: Request, res: Response) {
  const data = await aiService.chat(req.body, req.headers.authorization?.split(' ')[1])
  res.json(data)
}

export async function analyze(req: Request, res: Response) {
  const data = await aiService.analyze(req.body, req.headers.authorization?.split(' ')[1])
  res.json(data)
}

export async function convert(req: Request, res: Response) {
  const data = await aiService.convert(req.body, req.headers.authorization?.split(' ')[1])
  res.json(data)
}
