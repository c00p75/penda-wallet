import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { pendaOpenIdFromLocation, type PendaOpenKind } from './viewNavigation'

/**
 * Open an edit sheet as soon as a chat View deep link lands.
 * Prefers the in-memory list, then falls back to a single-row fetch.
 * Runs in layout effect so the sheet can paint with the destination page.
 */
export function useDeepLinkEntityOpen<T extends { id: string }>(options: {
  kind: PendaOpenKind
  /** Query-string id (e.g. ?tx=). */
  paramId: string | null
  list: T[]
  fetchById: (id: string) => Promise<T | null>
  onOpen: (item: T) => void
  /** Extra search keys to strip when clearing the deep link. */
  clearParamKeys?: string[]
}) {
  const { kind, paramId, list, fetchById, onOpen, clearParamKeys = [] } = options
  const location = useLocation()
  const navigate = useNavigate()
  const stateId = pendaOpenIdFromLocation(location.state, kind)
  const id = paramId ?? stateId
  const openedRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!id || openedRef.current === id) return

    const paramKey =
      kind === 'transaction' ? 'tx' : kind === 'budget' ? 'budget' : kind === 'debt' ? 'debt' : null

    const clear = () => {
      openedRef.current = id
      const params = new URLSearchParams(location.search)
      if (paramKey) params.delete(paramKey)
      for (const key of clearParamKeys) params.delete(key)
      const search = params.toString()
      navigate(
        { pathname: location.pathname, search: search ? `?${search}` : '' },
        { replace: true, state: {} },
      )
    }

    const fromList = list.find((item) => item.id === id)
    if (fromList) {
      onOpen(fromList)
      clear()
      return
    }

    let cancelled = false
    void fetchById(id)
      .then((item) => {
        if (cancelled || openedRef.current === id) return
        if (item) onOpen(item)
        clear()
      })
      .catch(() => {
        if (!cancelled && openedRef.current !== id) clear()
      })

    return () => {
      cancelled = true
    }
    // onOpen/fetchById are page-local setters / stable imports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, list, kind, location.pathname, location.search, navigate])
}
