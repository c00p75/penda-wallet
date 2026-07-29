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

/** Invites can never target 'owner' — that stays a distinct, explicit transfer. */
export type InviteRole = 'editor' | 'viewer'

export type WalletInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'

export interface WalletInvite {
  id: string
  wallet_id: string
  invited_email: string
  invited_user_id: string | null
  role: InviteRole
  status: WalletInviteStatus
  invited_by: string
  email_sent_at: string | null
  resend_count: number
  created_at: string
  responded_at: string | null
  expires_at: string
}

/** A pending invite addressed to the current user (see get_my_wallet_invites). */
export interface MyWalletInvite {
  id: string
  wallet_id: string
  wallet_name: string
  role: InviteRole
  invited_by_name: string
  created_at: string
  expires_at: string
}
