import { cn } from '@/lib/utils'

/** Semantic edge colors from the brand accent family. */
export type CardAccent = 'iris' | 'mint' | 'apricot' | 'rose' | 'sun'

/** Multi-color rim (mint → sun → apricot → iris) for featured Penda / tip cards. */
export const spectrumEdgeClass = 'penda-spectrum-edge'

/**
 * Soft colored ring for cards. Keeps fills neutral; color lives on the edge
 * so the UI feels warmer without purple-washing backgrounds.
 */
export function cardAccentClass(accent: CardAccent | undefined, className?: string) {
  return cn(
    'ring-1',
    accent === 'iris' && 'ring-[color-mix(in_srgb,var(--iris)_50%,var(--border))]',
    accent === 'mint' && 'ring-[color-mix(in_srgb,var(--mint)_50%,var(--border))]',
    accent === 'apricot' && 'ring-[color-mix(in_srgb,var(--apricot)_52%,var(--border))]',
    accent === 'rose' && 'ring-[color-mix(in_srgb,var(--rose)_48%,var(--border))]',
    accent === 'sun' && 'ring-[color-mix(in_srgb,var(--sun)_55%,var(--border))]',
    !accent && 'ring-border/50',
    className,
  )
}

/** Map insight / coaching tones onto card accents. */
export function accentFromInsightTone(
  tone: 'default' | 'warm' | 'attention' | undefined,
): CardAccent {
  if (tone === 'warm') return 'rose'
  if (tone === 'attention') return 'rose'
  return 'iris'
}
