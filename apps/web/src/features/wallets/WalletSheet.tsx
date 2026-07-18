import { useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarBlank,
  Camera,
  ChatCircle,
  MagicWand,
  Notebook,
  Path,
  Plus,
  Trophy,
} from '@/components/icons/product'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { IconTile } from '@/components/ui/icon-tile'
import { SectionHeader } from '@/components/ui/section-header'
import { useChatStore } from '@/features/chat/chatStore'
import { useQuickActionStore, type QuickActionIntent } from '@/features/home/quickActionStore'

interface WalletSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WalletSheet({ open, onOpenChange }: WalletSheetProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const openChat = useChatStore((s) => s.openChat)
  const requestQuickAction = useQuickActionStore((s) => s.request)

  function runAndClose(action: () => void) {
    onOpenChange(false)
    action()
  }

  function requestHomeIntent(intent: QuickActionIntent) {
    requestQuickAction(intent)
    onOpenChange(false)
    if (location.pathname !== '/') navigate('/')
  }

  const quickActions = [
    {
      icon: ChatCircle,
      label: 'Log expense',
      tone: 'iris' as const,
      onTap: () => runAndClose(() => openChat('I spent ')),
    },
    {
      icon: Camera,
      label: 'Scan receipt',
      tone: 'sun' as const,
      onTap: () => requestHomeIntent('scan-receipt'),
    },
    {
      icon: CalendarBlank,
      label: 'Cashflow',
      tone: 'mint' as const,
      onTap: () => runAndClose(() => navigate('/cashflow')),
    },
    {
      icon: Notebook,
      label: 'Journal',
      tone: 'rose' as const,
      onTap: () => runAndClose(() => navigate('/journal')),
    },
    {
      icon: MagicWand,
      label: 'What if…',
      tone: 'iris' as const,
      onTap: () => runAndClose(() => navigate('/simulator')),
    },
    {
      icon: Path,
      label: 'Missions',
      tone: 'apricot' as const,
      onTap: () => runAndClose(() => navigate('/missions')),
    },
    {
      icon: Trophy,
      label: 'Compete',
      tone: 'sun' as const,
      onTap: () => runAndClose(() => navigate('/challenges')),
    },
    {
      icon: Plus,
      label: 'Add txn',
      tone: 'mint' as const,
      onTap: () => requestHomeIntent('add-txn'),
    },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 pb-6">
          <section>
            <SectionHeader title="Quick actions" />
            <div className="grid grid-cols-3 gap-2.5">
              {quickActions.map(({ icon, label, tone, onTap }) => (
                <IconTile key={label} icon={icon} label={label} tone={tone} onClick={onTap} />
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
