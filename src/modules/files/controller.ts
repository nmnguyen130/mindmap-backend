import { Request, Response } from 'express'
import { filesService } from '@/modules/files/service'
import { aiService } from '@/modules/ai/service'
import { env } from '@/config/env'
import type { AuthedRequest } from '@/core/middlewares/auth'

export async function uploadFile(req: AuthedRequest, res: Response) {
  try {
    if (!req.file || !req.supabase) {
      return res.status(400).json({ error: 'No file uploaded or database not available' })
    }

    const result = await filesService.uploadFile(req.supabase, req.file)
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to upload file' })
  }
}

export async function processPDF(req: AuthedRequest, res: Response) {
  try {
    const { fileId } = req.params
    if (!req.supabase) throw new Error('Database connection not available')
    if (!req.user?.id) throw new Error('User not authenticated')

    // Get the uploaded file
    const { data: file, error } = await req.supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single()

    if (error || !file) {
      return res.status(404).json({ error: 'File not found' })
    }

    // Download the file from Supabase storage
    const { data: fileData, error: downloadError } = await req.supabase.storage
      .from(env.supabaseStorageBucket)
      .download(file.path!)

    if (downloadError) {
      return res.status(500).json({ error: 'Failed to download file for processing' })
    }

    // Convert to buffer
    const buffer = Buffer.from(await fileData.arrayBuffer())

    // Process the PDF with AI
    await aiService.processPDF(fileId!, buffer, req.supabase!, req.user.id)

    res.json({ message: 'PDF processed successfully' })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to process PDF' })
  }
}

export async function getFiles(req: AuthedRequest, res: Response) {
  try {
    if (!req.supabase) throw new Error('Database connection not available')

    const files = await filesService.getFiles(req.supabase)
    res.json(files)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get files' })
  }
}

export async function deleteFile(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params
    if (!req.supabase) throw new Error('Database connection not available')

    await filesService.deleteFile(req.supabase, id!)
    res.json({ message: 'File deleted successfully' })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete file' })
  }
}
