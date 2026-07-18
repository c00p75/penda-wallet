import { useEffect, useState } from 'react'
import { ClipboardText, Sparkle } from '@/components/icons/product'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { parseMoMoText, type ParsedMoMo } from './momoParser'
import type { TransactionDraft } from './types'

export function parsedToDraft(parsed: ParsedMoMo): TransactionDraft {
  const label = parsed.type === 'income' ? 'Received' : 'Sent'
  return {
    type: parsed.type,
    amount_minor: parsed.amountMinor,
    merchant: parsed.merchant,
    description: parsed.reference ? `${label} · Ref ${parsed.reference}` : null,
    transaction_date: parsed.transactionDate,
    source: 'sms',
    reported_balance_minor: parsed.balanceMinor,
  }
}

interface MoMoPasteSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Clipboard text captured when the chip was tapped, if any. */
  initialText?: string
  onParsed: (draft: TransactionDraft) => void
  onFallbackToAi: (text: string) => void
}

/**
 * Web fallback for ambient SMS parsing: the user pastes a mobile-money message
 * and we try to read it deterministically, handing anything we can't parse to
 * the AI so nothing is ever a dead end.
 */
export function MoMoPasteSheet({
  open,
  onOpenChange,
  initialText = '',
  onParsed,
  onFallbackToAi,
}: MoMoPasteSheetProps) {
  const [text, setText] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (open) {
      setText(initialText)
      setFailed(false)
    }
  }, [open, initialText])

  function handleRead() {
    const trimmed = text.trim()
    if (!trimmed) return
    const parsed = parseMoMoText(trimmed)
    if (parsed) {
      onParsed(parsedToDraft(parsed))
    } else {
      setFailed(true)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-2xl bg-[var(--iris-soft)] text-[var(--iris)]">
              <ClipboardText className="size-4" weight="duotone" />
            </span>
            Paste a MoMo message
          </SheetTitle>
          <SheetDescription>
            Copy the SMS from Airtel Money, MTN MoMo, or your bank and paste it here — I’ll turn it
            into a transaction.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-5 pb-6">
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setFailed(false)
            }}
            rows={5}
            placeholder="e.g. You have sent K250.00 to JOHN MULENGA. Your new balance is K1,250.00."
            autoFocus
          />

          {failed && (
            <p className="text-sm text-muted-foreground">
              I couldn’t read that automatically — let me take a closer look.
            </p>
          )}

          {failed ? (
            <Button type="button" onClick={() => onFallbackToAi(text.trim())} className="w-full">
              <Sparkle className="size-4" weight="fill" />
              Ask Penda to read it
            </Button>
          ) : (
            <Button type="button" onClick={handleRead} disabled={!text.trim()} className="w-full">
              Read message
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
