import type { SupabaseClient } from '@supabase/supabase-js'
import type { MindMapCreateInput, MindMapUpdateInput } from './validator'

export const mindmapsService = {
  async listMindMaps(supabase: SupabaseClient, userId: string) {
    const { data, error } = await supabase
      .from('mindmaps')
      .select('id, title, version, created_at, updated_at')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async createMindMap(supabase: SupabaseClient, userId: string, input: MindMapCreateInput) {
    // Debug: Check current user context
    const { data: currentUser, error: userError } = await supabase.auth.getUser()
    console.log('Current user from Supabase context:', currentUser?.user?.id, 'Expected userId:', userId)
    
    const { data: mindmap, error: mindmapError } = await supabase
      .from('mindmaps')
      .insert({
        owner_id: userId,
        title: input.title,
        version: 1
      })
      .select()
      .single()

    if (mindmapError) {
      console.error('MindMap creation error:', mindmapError)
      throw mindmapError
    }

      // Insert initial nodes if provided
    if (input.nodes && input.nodes.length > 0) {
      const nodesData = input.nodes.map((node) => ({
        id: node.id,
        mindmap_id: mindmap.id,
        text: node.text,
        position: node.position,
        data: node.data || {},
        notes: node.notes || null,
        parent_id: node.parent_id || null,
        children_order: node.children_order || []
      }))

      const { error: nodesError } = await supabase
        .from('mindmap_nodes')
        .insert(nodesData)

      if (nodesError) throw nodesError
    }

    return await this.getMindMap(supabase, mindmap.id, userId)
  },

  async getMindMap(supabase: SupabaseClient, mindmapId: string, userId: string) {
    // Check ownership
    const { data: ownership, error: ownerError } = await supabase
      .from('mindmaps')
      .select('id')
      .eq('id', mindmapId)
      .eq('owner_id', userId)
      .single()

    if (ownerError || !ownership) throw new Error('Mindmap not found or access denied')

    // Get mindmap
    const { data: mindmap, error: mindmapError } = await supabase
      .from('mindmaps')
      .select('id, title, version, created_at, updated_at')
      .eq('id', mindmapId)
      .single()

    if (mindmapError) throw mindmapError

    // Get nodes
    const { data: nodes, error: nodesError } = await supabase
      .from('mindmap_nodes')
      .select('*')
      .eq('mindmap_id', mindmapId)
      .order('updated_at', { ascending: false })

    if (nodesError) throw nodesError

    return {
      ...mindmap,
      nodes: nodes || []
    }
  },

  async updateMindMap(supabase: SupabaseClient, mindmapId: string, userId: string, input: MindMapUpdateInput) {
    // Check ownership
    const { data: ownership, error: ownerError } = await supabase
      .from('mindmaps')
      .select('id')
      .eq('id', mindmapId)
      .eq('owner_id', userId)
      .single()

    if (ownerError || !ownership) throw new Error('Mindmap not found or access denied')

    const updateData: any = { updated_at: new Date().toISOString() }
    if (input.title !== undefined) updateData.title = input.title
    if (input.version !== undefined) updateData.version = input.version

    const { error: updateError } = await supabase
      .from('mindmaps')
      .update(updateData)
      .eq('id', mindmapId)

    if (updateError) throw updateError

    // Handle nodes update - assume client sends full node set
    if (input.nodes !== undefined) {
      // Delete existing nodes
      await supabase
        .from('mindmap_nodes')
        .delete()
        .eq('mindmap_id', mindmapId)

      // Insert new nodes
      if (input.nodes.length > 0) {
        const nodesData = input.nodes.map((node) => ({
          id: node.id,
          mindmap_id: mindmapId,
          text: node.text,
          position: node.position,
          data: node.data || {},
          notes: node.notes || null,
          parent_id: node.parent_id || null,
          children_order: node.children_order || []
        }))

        const { error: nodesError } = await supabase
          .from('mindmap_nodes')
          .insert(nodesData)

        if (nodesError) throw nodesError
      }
    }

    return await this.getMindMap(supabase, mindmapId, userId)
  },

  async deleteMindMap(supabase: SupabaseClient, mindmapId: string, userId: string) {
    // Check ownership
    const { data: ownership, error: ownerError } = await supabase
      .from('mindmaps')
      .select('id')
      .eq('id', mindmapId)
      .eq('owner_id', userId)
      .single()

    if (ownerError || !ownership) throw new Error('Mindmap not found or access denied')

    const { error: mindmapError } = await supabase
      .from('mindmaps')
      .delete()
      .eq('id', mindmapId)

    if (mindmapError) throw mindmapError
  },

  async listNodes(supabase: SupabaseClient, mindmapId: string, userId: string) {
    // Check ownership via mindmap
    const { data: ownership, error: ownerError } = await supabase
      .from('mindmaps')
      .select('id')
      .eq('id', mindmapId)
      .eq('owner_id', userId)
      .single()

    if (ownerError || !ownership) throw new Error('Mindmap not found or access denied')

    const { data, error } = await supabase
      .from('mindmap_nodes')
      .select('*')
      .eq('mindmap_id', mindmapId)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async addNode(supabase: SupabaseClient, mindmapId: string, nodeData: any, userId: string) {
    // Check ownership via mindmap
    const { data: ownership, error: ownerError } = await supabase
      .from('mindmaps')
      .select('id')
      .eq('id', mindmapId)
      .eq('owner_id', userId)
      .single()

    if (ownerError || !ownership) throw new Error('Mindmap not found or access denied')

    const { data, error } = await supabase
      .from('mindmap_nodes')
      .insert({
        id: nodeData.id,
        mindmap_id: mindmapId,
        text: nodeData.text,
        position: nodeData.position,
        data: nodeData.data || {},
        notes: nodeData.notes || null,
        parent_id: nodeData.parent_id || null,
        children_order: nodeData.children_order || []
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateNode(supabase: SupabaseClient, nodeId: string, nodeData: any, userId: string) {
    // Get node to check ownership
    const { data: node, error: nodeError } = await supabase
      .from('mindmap_nodes')
      .select('mindmap_id')
      .eq('id', nodeId)
      .single()

    if (nodeError || !node) throw new Error('Node not found')

    // Check ownership
    const { data: ownership, error: ownerError } = await supabase
      .from('mindmaps')
      .select('id')
      .eq('id', node.mindmap_id)
      .eq('owner_id', userId)
      .single()

    if (ownerError || !ownership) throw new Error('Access denied')

    const updateData: any = { updated_at: new Date().toISOString() }
    if (nodeData.text !== undefined) updateData.text = nodeData.text
    if (nodeData.position !== undefined) updateData.position = nodeData.position
    if (nodeData.data !== undefined) updateData.data = nodeData.data
    if (nodeData.notes !== undefined) updateData.notes = nodeData.notes
    if (nodeData.parent_id !== undefined) updateData.parent_id = nodeData.parent_id
    if (nodeData.children_order !== undefined) updateData.children_order = nodeData.children_order
    if (nodeData.collapsed !== undefined) updateData.collapsed = nodeData.collapsed

    const { data, error } = await supabase
      .from('mindmap_nodes')
      .update(updateData)
      .eq('id', nodeId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async deleteNode(supabase: SupabaseClient, nodeId: string, userId: string) {
    // Get node to check ownership
    const { data: node, error: nodeError } = await supabase
      .from('mindmap_nodes')
      .select('mindmap_id')
      .eq('id', nodeId)
      .single()

    if (nodeError || !node) throw new Error('Node not found')

    // Check ownership
    const { data: ownership, error: ownerError } = await supabase
      .from('mindmaps')
      .select('id')
      .eq('id', node.mindmap_id)
      .eq('owner_id', userId)
      .single()

    if (ownerError || !ownership) throw new Error('Access denied')

    const { error } = await supabase
      .from('mindmap_nodes')
      .delete()
      .eq('id', nodeId)

    if (error) throw error
  }
}
