import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

interface EmojiPickerProps {
  emojis: string[]
  value: string | null
  onChange: (value: string | null) => void
}

/**
 * A curated tappable grid plus a free-text fallback — phones already have a
 * full emoji keyboard, so typing/pasting into the input covers anything the
 * grid doesn't.
 */
export function EmojiPicker({ emojis, value, onChange }: EmojiPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
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
        {emojis.map((emoji) => (
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
        ))}
      </div>
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
