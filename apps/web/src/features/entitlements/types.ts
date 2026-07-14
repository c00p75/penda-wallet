export type Plan = 'free' | 'premium'

export interface Entitlement {
  user_id: string
  plan: Plan
  status: string | null
  current_period_end: string | null
}

export type PremiumFeature = 'voice' | 'receipt-scan' | 'insights' | 'shared-wallets'

export const FEATURE_COPY: Record<PremiumFeature, { title: string; description: string }> = {
  voice: {
    title: 'Voice entry',
    description: 'Log transactions by talking to Penda instead of typing.',
  },
  'receipt-scan': {
    title: 'Receipt scanning',
    description: 'Snap a photo and Penda extracts the merchant, total, and category.',
  },
  insights: {
    title: 'Weekly AI insights',
    description: 'A personalized spending digest delivered to you every week.',
  },
  'shared-wallets': {
    title: 'Unlimited shared members',
    description: 'Free wallets are limited to 2 members — invite your whole household on Premium.',
  },
}
