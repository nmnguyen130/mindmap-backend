import { Request, Response } from 'express'
import { filesService } from '@/modules/files/service'
import type { AuthedRequest } from '@/core/middlewares/auth'

export async function uploadFile(req: AuthedRequest, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const result = await filesService.uploadFile(req.supabase!, req.user!.id, req.file)
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to upload file' })
  }
}

export async function processPDF(req: AuthedRequest, res: Response) {
  try {
    res.json({ message: 'PDF processing not implemented yet' })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to process PDF' })
  }
}

export async function getFiles(req: AuthedRequest, res: Response) {
  try {
    const files = await filesService.getFiles(req.supabase!)
    res.json(files)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get files' })
  }
}

export async function deleteFile(req: AuthedRequest, res: Response) {
  try {
    await filesService.deleteFile(req.supabase!, req.params.id!)
    res.json({ message: 'File deleted successfully' })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete file' })
  }
}
