export interface Position { x: number; y: number }

export interface MindMapNode {
  id: string
  text: string
  position: Position
  connections: string[]
  notes?: string
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
