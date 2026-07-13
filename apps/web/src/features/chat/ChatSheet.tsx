import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSendChatMessage } from './hooks'
import type { ChatMessage } from './types'

interface ChatSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  walletId: string | undefined
}

let messageIdCounter = 0
const nextId = () => `msg-${++messageIdCounter}`

export function ChatSheet({ open, onOpenChange, walletId }: ChatSheetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [input, setInput] = useState('')
  const sendMessage = useSendChatMessage(walletId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sendMessage.isPending) return

    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text }])
    setInput('')

    try {
      const result = await sendMessage.mutateAsync({ message: text, conversationId })
      setConversationId(result.conversationId)
      setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: result.reply }])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: error instanceof Error ? `Something went wrong: ${error.message}` : 'Something went wrong.',
        },
      ])
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[85svh] flex-col">
        <SheetHeader>
          <SheetTitle>Chat with Penda</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tell me about a purchase or payment — "spent $12 on coffee at Blue Bottle".
            </p>
          )}
          <div className="flex flex-col gap-3 pb-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : 'mr-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm'
                }
              >
                {m.text}
              </div>
            ))}
            {sendMessage.isPending && (
              <div className="mr-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                Thinking…
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="I spent $12 on coffee..."
            autoComplete="off"
          />
          <Button type="submit" disabled={sendMessage.isPending}>
            Send
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
