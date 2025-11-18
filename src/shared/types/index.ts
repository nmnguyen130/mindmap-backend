export interface Position { x: number; y: number }

export interface MindMapNode {
  id: string
  text: string
  position: Position
  parent_id?: string | null
  children_order?: string[]
  data?: any
  notes?: string
  collapsed?: boolean
  created_at?: string
  updated_at?: string
}

export interface MindMap {
  id: string
  title: string
  nodes: MindMapNode[]
  createdAt: string
  updatedAt: string
  version?: number
}

export interface AuthUser {
  id: string
  email: string
}
