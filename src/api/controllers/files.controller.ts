import { Response } from 'express'
import { AuthedRequest } from '../middlewares/auth'
import { uploadPdf, listFiles, deleteFile } from '../../services/storage'

export async function upload(req: AuthedRequest, res: Response) {
  const file = (req as any).file as any
  if (!file) return res.status(400).json({ error: 'No file' })
  const userId = req.user?.id as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  const path = await uploadPdf(userId, file.originalname, file.buffer, file.mimetype)
  res.status(201).json({ success: true, path })
}

export async function list(req: AuthedRequest, res: Response) {
  const userId = req.user?.id as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  const data = await listFiles(userId)
  res.json({ success: true, data })
}

export async function remove(req: AuthedRequest, res: Response) {
  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Missing id' })
  await deleteFile(id)
  res.status(204).send()
}
