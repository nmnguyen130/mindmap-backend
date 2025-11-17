import { supabaseAdmin } from '../../config/supabase'
import { env } from '../../config/env'

export async function uploadPdf(userId: string, fileName: string, buffer: Buffer, contentType: string) {
  if (contentType !== 'application/pdf') throw new Error('Only PDF allowed')
  const path = `${userId}/${Date.now()}_${fileName}`
  const { data, error } = await supabaseAdmin.storage.from(env.supabaseStorageBucket).upload(path, buffer, {
    contentType,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return data.path
}

export async function listFiles(userId: string) {
  const { data, error } = await supabaseAdmin.storage.from(env.supabaseStorageBucket).list(userId)
  if (error) throw new Error(error.message)
  return data
}

export async function deleteFile(path: string) {
  const { error } = await supabaseAdmin.storage.from(env.supabaseStorageBucket).remove([path])
  if (error) throw new Error(error.message)
}
