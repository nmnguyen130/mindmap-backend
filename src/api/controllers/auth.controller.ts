import { Request, Response } from 'express'
import * as Auth from '../../services/auth'

export async function register(req: Request, res: Response) {
  const { email, password } = req.body
  const data = await Auth.register(email, password)
  res.status(201).json({ success: true, data })
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body
  const data = await Auth.login(email, password)
  res.json({ success: true, data })
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body
  const data = await Auth.refresh(refreshToken)
  res.json({ success: true, data })
}

export async function me(req: Request, res: Response) {
  // user injected by auth middleware when used
  res.json({ success: true, data: (req as any).user })
}
