import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const DRAG_CLOSE_THRESHOLD = 100

/**
 * Drag-to-dismiss chrome for edge-docked bottom sheets (notch + translate).
 */
export function useBottomSheetDrag(onDismiss: () => void) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const dragStartYRef = useRef(0)
  const dragYRef = useRef(0)

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    setDragging(true)
    dragStartYRef.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    const next = Math.max(0, e.clientY - dragStartYRef.current)
    dragYRef.current = next
    setDragY(next)
  }

  function onHandlePointerEnd() {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    if (dragYRef.current > DRAG_CLOSE_THRESHOLD) onDismiss()
    dragYRef.current = 0
    setDragY(0)
  }

  return {
    sheetStyle: {
      transform: dragY ? `translateY(${dragY}px)` : undefined,
      transition: dragging ? 'none' : 'transform 200ms ease-out',
    } satisfies React.CSSProperties,
    handleProps: {
      onPointerDown: onHandlePointerDown,
      onPointerMove: onHandlePointerMove,
      onPointerUp: onHandlePointerEnd,
      onPointerCancel: onHandlePointerEnd,
    },
  }
}

export function BottomSheetHandle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex shrink-0 touch-none justify-center pt-3 pb-1', className)}
      {...props}
    >
      <div className="h-1 w-10 rounded-full bg-border/70" />
    </div>
  )
}
