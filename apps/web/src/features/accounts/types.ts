export type AccountKind = 'cash' | 'mobile_money' | 'bank' | 'other'

export type AccountProvider = 'airtel' | 'mtn' | 'zamtel' | 'zanaco' | 'other'

/** A pocket under a money account (Cash, Airtel Money, MTN, …). */
export interface Account {
  id: string
  wallet_id: string
  name: string
  kind: AccountKind
  provider: AccountProvider | null
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
  kind: AccountKind
  provider?: AccountProvider | null
  icon?: string | null
  color?: string | null
  sort_order?: number
  is_default?: boolean
}

export const ACCOUNT_KIND_OPTIONS: { value: AccountKind; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
]

export const ACCOUNT_PROVIDER_OPTIONS: { value: AccountProvider; label: string; icon: string }[] = [
  { value: 'airtel', label: 'Airtel Money', icon: '📱' },
  { value: 'mtn', label: 'MTN MoMo', icon: '📱' },
  { value: 'zamtel', label: 'Zamtel Kwacha', icon: '📱' },
  { value: 'zanaco', label: 'Zanaco', icon: '🏦' },
  { value: 'other', label: 'Other', icon: '💳' },
]

export const QUICK_POCKET_PRESETS: Array<{
  name: string
  kind: AccountKind
  provider: AccountProvider | null
  icon: string
}> = [
  { name: 'Cash', kind: 'cash', provider: null, icon: '💵' },
  { name: 'Airtel Money', kind: 'mobile_money', provider: 'airtel', icon: '📱' },
  { name: 'MTN MoMo', kind: 'mobile_money', provider: 'mtn', icon: '📱' },
  { name: 'Zanaco', kind: 'bank', provider: 'zanaco', icon: '🏦' },
]
