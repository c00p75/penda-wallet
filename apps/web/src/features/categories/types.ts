export interface Category {
  id: string
  wallet_id: string | null
  name: string
  icon: string | null
  color: string | null
  parent_category_id: string | null
  is_system: boolean
}

export interface CategoryInput {
  name: string
  icon: string | null
  color: string | null
}
