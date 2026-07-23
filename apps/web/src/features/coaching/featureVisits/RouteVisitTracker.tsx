import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { pageContextFromPathname } from '@/features/chat/pageContext'
import { useRecordFeatureVisit } from './hooks'

/** Renders nothing; records each navigation as a visit to that page's wallet row. */
export function RouteVisitTracker() {
  const { pathname } = useLocation()
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()
  const walletId = wallet?.id
  const userId = session?.user.id
  const recordVisit = useRecordFeatureVisit(walletId, userId)
  const { mutate } = recordVisit

  useEffect(() => {
    if (!walletId || !userId) return
    const context = pageContextFromPathname(pathname)
    if (!context) return
    mutate(context.page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, walletId, userId])

  return null
}
