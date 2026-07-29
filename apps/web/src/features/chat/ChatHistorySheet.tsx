import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ActivityRow } from '@/components/ui/activity-row'
import { cn } from '@/lib/utils'
import { relativeTimeLabel } from '@/features/memory/relativeTime'
import { useChatConversations } from './hooks'

export function ChatHistorySheet({
  open,
  onOpenChange,
  userId,
  walletId,
  activeConversationId,
  busy = false,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | undefined
  walletId: string | undefined
  activeConversationId?: string
  /** A conversation is currently loading into the thread; disable further taps. */
  busy?: boolean
  onSelect: (conversationId: string) => void
}) {
  const { data: conversations = [], isLoading } = useChatConversations(userId, walletId, open)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-4">
        <SheetHeader>
          <SheetTitle>Chat history</SheetTitle>
          <SheetDescription>Pick up an earlier conversation with Penda.</SheetDescription>
        </SheetHeader>

        <div className={cn('flex flex-col gap-2 px-5 pb-5', busy && 'pointer-events-none opacity-60')}>
          {isLoading && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {!isLoading && conversations.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              No past conversations yet.
            </p>
          )}
          {conversations.map((c) => (
            <ActivityRow
              key={c.id}
              title={c.preview}
              subtitle={relativeTimeLabel(c.createdAt)}
              showChevron
              accent={c.id === activeConversationId ? 'iris' : undefined}
              onClick={() => onSelect(c.id)}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
