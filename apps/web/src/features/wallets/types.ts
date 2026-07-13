export interface Wallet {
  id: string
  name: string
  is_shared: boolean
  base_currency: string
  created_by: string
  created_at: string
}

export type WalletRole = 'owner' | 'editor' | 'viewer'

export interface WalletMember {
  user_id: string
  email: string
  display_name: string | null
  role: WalletRole
  joined_at: string
}
