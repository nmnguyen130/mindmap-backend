import { Request, Response } from 'express'
import type { AuthedRequest } from '@/core/middlewares/auth'
import { mindmapsService } from './service'

// Mindmaps controller functions
export async function listMindMaps(req: AuthedRequest, res: Response) {
  try {
    const mindmaps = await mindmapsService.listMindMaps(req.supabase!, req.user!.id)
    res.json(mindmaps)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list mindmaps' })
  }
}

export async function createMindMap(req: AuthedRequest, res: Response) {
  try {
    const data = await mindmapsService.createMindMap(req.supabase!, req.user!.id, req.body)
    res.json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create mindmap' })
  }
}

export async function getMindMap(req: AuthedRequest, res: Response) {
  try {
    const mindmap = await mindmapsService.getMindMap(req.supabase!, req.params.id!, req.user!.id)
    res.json(mindmap)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get mindmap' })
  }
}

export async function updateMindMap(req: AuthedRequest, res: Response) {
  try {
    const data = await mindmapsService.updateMindMap(req.supabase!, req.params.id!, req.user!.id, req.body)
    res.json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update mindmap' })
  }
}

export async function deleteMindMap(req: AuthedRequest, res: Response) {
  try {
    await mindmapsService.deleteMindMap(req.supabase!, req.params.id!, req.user!.id)
    res.json({ message: 'Mindmap deleted successfully' })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete mindmap' })
  }
}

// Nodes controller functions
export async function listNodes(req: AuthedRequest, res: Response) {
  try {
    const nodes = await mindmapsService.listNodes(req.supabase!, req.params.id!, req.user!.id)
    res.json(nodes)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list nodes' })
  }
}

export async function addNode(req: AuthedRequest, res: Response) {
  try {
    const data = await mindmapsService.addNode(req.supabase!, req.params.id!, req.body, req.user!.id)
    res.json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to add node' })
  }
}

export async function updateNode(req: AuthedRequest, res: Response) {
  try {
    const data = await mindmapsService.updateNode(req.supabase!, req.params.id!, req.body, req.user!.id)
    res.json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update node' })
  }
}

export async function deleteNode(req: AuthedRequest, res: Response) {
  try {
    await mindmapsService.deleteNode(req.supabase!, req.params.id!, req.user!.id)
    res.json({ message: 'Node deleted successfully' })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete node' })
  }
}
