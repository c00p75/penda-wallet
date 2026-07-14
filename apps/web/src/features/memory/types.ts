export type MemoryKind = 'note' | 'mood' | 'preference' | 'fact'

export interface AiMemory {
  id: string
  user_id: string
  wallet_id: string | null
  kind: MemoryKind
  content: string
  mood: string | null
  created_at: string
}

export interface AiMemoryInput {
  wallet_id: string | null
  kind: MemoryKind
  content: string
  mood: string | null
}
