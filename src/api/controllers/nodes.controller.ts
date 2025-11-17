import { Response } from 'express'
import { AuthedRequest } from '../middlewares/auth'
import { positionSchema } from '../validators/mindmaps'

export async function listNodes(req: AuthedRequest, res: Response) {
  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Missing id' })
  const sb = req.supabase!
  const { data, error } = await sb.from('mindmap_nodes').select('*').eq('mindmap_id', id)
  if (error) throw new Error(error.message)
  res.json({ success: true, data })
}

export async function addNode(req: AuthedRequest, res: Response) {
  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Missing id' })
  const body = req.body as { id: string; text: string; position: { x: number; y: number }; connections: string[]; notes?: string }
  positionSchema.parse(body.position)
  const insert = { id: body.id, mindmap_id: id, text: body.text, position: body.position, connections: body.connections, notes: body.notes }
  const sb = req.supabase!
  const { data, error } = await sb.from('mindmap_nodes').insert(insert).select('*').single()
  if (error) throw new Error(error.message)
  res.status(201).json({ success: true, data })
}

export async function updateNode(req: AuthedRequest, res: Response) {
  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Missing id' })
  const updates = req.body
  const sb = req.supabase!
  const { data, error } = await sb.from('mindmap_nodes').update(updates).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  res.json({ success: true, data })
}

export async function deleteNode(req: AuthedRequest, res: Response) {
  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Missing id' })
  const sb = req.supabase!
  const { error } = await sb.from('mindmap_nodes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  res.status(204).send()
}
