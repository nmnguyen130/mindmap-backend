import { Response } from 'express'
import { AuthedRequest } from '../middlewares/auth'
import { mindMapCreateSchema, mindMapUpdateSchema } from '../validators/mindmaps'
import { broadcastMindMapEvent } from '../../services/realtime'

export async function listMindMaps(req: AuthedRequest, res: Response) {
  const sb = req.supabase!
  const { data, error } = await sb
    .from('mindmaps')
    .select('*')
    .eq('owner_id', req.user!.id)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  res.json({ success: true, data })
}

export async function createMindMap(req: AuthedRequest, res: Response) {
  const body = mindMapCreateSchema.parse(req.body)
  const insert = {
    title: body.title,
    nodes: body.nodes,
    owner_id: req.user!.id,
    version: 1,
  }
  const sb = req.supabase!
  const { data, error } = await sb.from('mindmaps').insert(insert).select('*').single()
  if (error) throw new Error(error.message)
  await broadcastMindMapEvent(data.id, 'mindmap_created', { id: data.id })
  res.status(201).json({ success: true, data })
}

export async function getMindMap(req: AuthedRequest, res: Response) {
  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Missing id' })
  const sb = req.supabase!
  const { data, error } = await sb
    .from('mindmaps')
    .select('*')
    .eq('id', id)
    .eq('owner_id', req.user!.id)
    .single()
  if (error) throw new Error(error.message)
  res.json({ success: true, data })
}

export async function updateMindMap(req: AuthedRequest, res: Response) {
  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Missing id' })
  const body = mindMapUpdateSchema.parse(req.body)
  // optimistic lock: require matching version
  const sb = req.supabase!
  const { data, error } = await sb
    .from('mindmaps')
    .update({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.nodes ? { nodes: body.nodes } : {}),
      version: (body.version ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('owner_id', req.user!.id)
    .eq('version', body.version)
    .select('*')
    .single()
  if (error) return res.status(409).json({ error: 'Version conflict' })
  await broadcastMindMapEvent(id, 'mindmap_updated', { id })
  res.json({ success: true, data })
}

export async function deleteMindMap(req: AuthedRequest, res: Response) {
  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Missing id' })
  const sb = req.supabase!
  const { error } = await sb
    .from('mindmaps')
    .delete()
    .eq('id', id)
    .eq('owner_id', req.user!.id)
  if (error) throw new Error(error.message)
  await broadcastMindMapEvent(id, 'mindmap_deleted', { id })
  res.status(204).send()
}
