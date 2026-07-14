import { useEffect, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSendChatMessage } from './hooks'
import { useVoiceRecorder } from './useVoiceRecorder'
import type { ChatMessage } from './types'

interface ChatSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  walletId: string | undefined
  initialInput?: string
  isVoicePremium: boolean
  onRequireVoicePremium: () => void
}

let messageIdCounter = 0
const nextId = () => `msg-${++messageIdCounter}`

export function ChatSheet({
  open,
  onOpenChange,
  walletId,
  initialInput,
  isVoicePremium,
  onRequireVoicePremium,
}: ChatSheetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [input, setInput] = useState('')
  const sendMessage = useSendChatMessage(walletId)

  useEffect(() => {
    if (open && initialInput) setInput(initialInput)
  }, [open, initialInput])

  const voice = useVoiceRecorder(
    (transcript) => setInput((prev) => (prev ? `${prev} ${transcript}` : transcript)),
    (message) => toast.error(message),
  )

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
              Tell me about a purchase or payment — "spent $12 on coffee at Blue Bottle", or tap the
              mic to say it instead.
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
            {voice.state === 'transcribing' && (
              <div className="mr-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                Transcribing…
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={voice.state === 'recording' ? 'Listening…' : 'I spent $12 on coffee...'}
            autoComplete="off"
          />
          <Button
            type="button"
            variant={voice.state === 'recording' ? 'destructive' : 'outline'}
            size="icon"
            disabled={voice.state === 'transcribing'}
            onClick={() => {
              if (voice.state === 'recording') {
                voice.stop()
              } else if (!isVoicePremium) {
                onRequireVoicePremium()
              } else {
                voice.start()
              }
            }}
            aria-label={voice.state === 'recording' ? 'Stop recording' : 'Record a voice message'}
          >
            {voice.state === 'recording' ? <Square className="size-4" /> : <Mic className="size-4" />}
          </Button>
          <Button type="submit" disabled={sendMessage.isPending}>
            Send
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
