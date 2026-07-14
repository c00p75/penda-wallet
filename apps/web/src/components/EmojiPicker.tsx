import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

export interface EmojiGroup {
  label: string
  emojis: string[]
}

interface EmojiPickerProps {
  /** Flat list of choices. Provide this OR `groups`. */
  emojis?: string[]
  /** Labeled sections of choices, rendered with headers and a scroll area. */
  groups?: EmojiGroup[]
  value: string | null
  onChange: (value: string | null) => void
}

/**
 * A curated tappable grid plus a free-text fallback — phones already have a
 * full emoji keyboard, so typing/pasting into the input covers anything the
 * grid doesn't. Pass `groups` for a large, categorized set (scrolls); pass
 * `emojis` for a short flat set.
 */
export function EmojiPicker({ emojis, groups, value, onChange }: EmojiPickerProps) {
  const clearButton = (
    <button
      type="button"
      onClick={() => onChange(null)}
      aria-label="No icon"
      aria-pressed={!value}
      className={cn(
        'flex size-9 items-center justify-center rounded-full border text-muted-foreground',
        !value ? 'border-foreground bg-accent' : 'border-transparent bg-muted',
      )}
    >
      <X className="size-4" />
    </button>
  )

  const emojiButton = (emoji: string) => (
    <button
      key={emoji}
      type="button"
      onClick={() => onChange(emoji)}
      aria-label={emoji}
      aria-pressed={value === emoji}
      className={cn(
        'flex size-9 items-center justify-center rounded-full border text-lg',
        value === emoji ? 'border-foreground bg-accent' : 'border-transparent bg-muted',
      )}
    >
      {emoji}
    </button>
  )

  return (
    <div className="flex flex-col gap-2">
      {groups ? (
        <div className="flex max-h-64 flex-col gap-3 overflow-y-auto rounded-xl border bg-muted/30 p-2">
          <div className="flex flex-wrap gap-1.5">{clearButton}</div>
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">{group.emojis.map(emojiButton)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {clearButton}
          {(emojis ?? []).map(emojiButton)}
        </div>
      )}
      <Input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="Or type/paste any emoji"
        maxLength={8}
        className="w-32"
      />
    </div>
  )
}
