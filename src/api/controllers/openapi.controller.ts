import { Request, Response } from 'express'
import path from 'node:path'

export function openapi(req: Request, res: Response) {
  res.sendFile(path.join(process.cwd(), 'src', 'api', 'docs', 'openapi.json'))
}
