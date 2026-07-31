/** A user-defined pocket Type (Cash, Mobile money, Bank, …), scoped to a wallet. */
export interface PocketType {
  id: string
  wallet_id: string
  name: string
  icon: string | null
  sort_order: number
  created_at: string
}

export interface PocketTypeInput {
  name: string
  icon?: string | null
  sort_order?: number
}

/** A pocket under a money account (Cash, or any custom Type a user defines). */
export interface Account {
  id: string
  wallet_id: string
  name: string
  kind_id: string | null
  kind: PocketType | null
  icon: string | null
  color: string | null
  sort_order: number
  is_default: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface AccountInput {
  name: string
  kind_id: string | null
  icon?: string | null
  color?: string | null
  sort_order?: number
  is_default?: boolean
}
