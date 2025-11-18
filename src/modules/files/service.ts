import { env } from '@/config/env'
import type { SupabaseClient } from '@supabase/supabase-js'

export const filesService = {
  async uploadFile(supabase: SupabaseClient, file: Express.Multer.File) {
    try {
      // Upload file to Supabase storage
      const filePath = `${Date.now()}-${file.originalname}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(env.supabaseStorageBucket)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
        })

      if (uploadError) throw uploadError

      // Save file metadata to database
      const { data: fileRecord, error: dbError } = await supabase
        .from('files')
        .insert({
          path: filePath,
        })
        .select()
        .single()

      if (dbError) throw dbError

      return {
        id: fileRecord.id,
        path: filePath,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      }
    } catch (error) {
      console.error('File upload error:', error)
      throw new Error(`Failed to upload file: ${(error as Error).message}`)
    }
  },

  async getFiles(supabase: SupabaseClient) {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Get files error:', error)
      throw new Error(`Failed to get files: ${(error as Error).message}`)
    }
  },

  async deleteFile(supabase: SupabaseClient, fileId: string) {
    try {
      // Get file info first
      const { data: file, error: fetchError } = await supabase
        .from('files')
        .select('path')
        .eq('id', fileId)
        .single()

      if (fetchError) throw fetchError

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from(env.supabaseStorageBucket)
        .remove([file.path])

      if (storageError) throw storageError

      // Delete from database
      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .eq('id', fileId)

      if (dbError) throw dbError
    } catch (error) {
      console.error('Delete file error:', error)
      throw new Error(`Failed to delete file: ${(error as Error).message}`)
    }
  }
}
