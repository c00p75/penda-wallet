import { useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarBlank,
  Camera,
  ChatCircle,
  MagicWand,
  Notebook,
  Path,
  Target,
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

  // Capture = talk to Penda. Explore = depth pages. No parallel "Add txn" form , 
  // manual edit stays on the ledger / activity rows.
  const captureActions = [
    {
      icon: ChatCircle,
      label: 'Log expense',
      tone: 'iris' as const,
      onTap: () => runAndClose(() => openChat('I spent ', { mode: 'quick' })),
    },
    {
      icon: Camera,
      label: 'Scan receipt',
      tone: 'rose' as const,
      onTap: () => requestHomeIntent('scan-receipt'),
    },
  ]

  const planActions = [
    {
      icon: Target,
      label: 'Goals',
      tone: 'rose' as const,
      onTap: () => runAndClose(() => navigate('/goals')),
    },
    {
      icon: CalendarBlank,
      label: 'Cashflow',
      tone: 'iris' as const,
      onTap: () => runAndClose(() => navigate('/cashflow')),
    },
    {
      icon: Notebook,
      label: 'Journal',
      tone: 'rose' as const,
      onTap: () => runAndClose(() => navigate('/journal')),
    },
  ]

  const suiteActions = [
    {
      icon: MagicWand,
      label: 'What if…',
      tone: 'iris' as const,
      onTap: () => runAndClose(() => navigate('/simulator')),
    },
    {
      icon: Path,
      label: 'Missions',
      tone: 'iris' as const,
      onTap: () => runAndClose(() => navigate('/missions')),
    },
    {
      icon: Trophy,
      label: 'Compete',
      tone: 'rose' as const,
      onTap: () => runAndClose(() => navigate('/challenges')),
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
            <SectionHeader title="Capture" />
            <div className="grid grid-cols-3 gap-2.5">
              {captureActions.map(({ icon, label, tone, onTap }) => (
                <IconTile key={label} icon={icon} label={label} tone={tone} onClick={onTap} />
              ))}
            </div>
          </section>

          <section>
            <SectionHeader title="Plan" />
            <div className="grid grid-cols-3 gap-2.5">
              {planActions.map(({ icon, label, tone, onTap }) => (
                <IconTile key={label} icon={icon} label={label} tone={tone} onClick={onTap} />
              ))}
            </div>
          </section>

          <section>
            <SectionHeader title="More" />
            <div className="grid grid-cols-3 gap-2.5">
              {suiteActions.map(({ icon, label, tone, onTap }) => (
                <IconTile key={label} icon={icon} label={label} tone={tone} onClick={onTap} />
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
