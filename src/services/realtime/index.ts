import { supabaseAnon } from '../../config/supabase'

export async function broadcastMindMapEvent(mindMapId: string, type: string, payload: unknown) {
  // Broadcast over a channel for clients to receive via Supabase Realtime
  const channel = supabaseAnon.channel(`mindmap-${mindMapId}`)
  await channel.subscribe()
  await channel.send({ type: 'broadcast', event: type, payload })
  channel.unsubscribe()
}
