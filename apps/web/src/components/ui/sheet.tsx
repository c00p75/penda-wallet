"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useOverlayOriginStore } from "@/lib/overlayOrigin"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  instantDismiss,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay> & {
  instantDismiss?: boolean
}) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      data-instant-dismiss={instantDismiss ? "" : undefined}
      className={cn(
        "fixed inset-0 z-50 bg-black/40 duration-200 supports-backdrop-filter:backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function useOriginStyle(): React.CSSProperties | undefined {
  const [originStyle] = React.useState<React.CSSProperties | undefined>(() => {
    const { x, y, at } = useOverlayOriginStore.getState()
    if (!at || Date.now() - at > 2000) return undefined
    return {
      "--overlay-ox": `${x}px`,
      "--overlay-oy": `${y}px`,
    } as React.CSSProperties
  })
  return originStyle
}

/**
 * Floating modal card, inset from the screen edges with full rounding.
 * `side` only chooses where the card sits (bottom / left / right / top),
 * not an edge-docked drawer.
 * Pass `size="page"` for a full-viewport surface (e.g. chat).
 * Pass `size="half"` for a tall bottom sheet (quick-log chat).
 */
function SheetContent({
  className,
  children,
  side = "bottom",
  size = "card",
  showCloseButton = true,
  /** Skip exit animation (e.g. chat View → destination). */
  instantDismiss = false,
  style,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  size?: "card" | "page" | "half"
  showCloseButton?: boolean
  instantDismiss?: boolean
}) {
  const originStyle = useOriginStyle()
  const isPage = size === "page"
  const isHalf = size === "half"

  return (
    <SheetPortal>
      <SheetOverlay instantDismiss={instantDismiss} />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        data-size={size}
        data-instant-dismiss={instantDismiss ? "" : undefined}
        style={{ ...originStyle, ...style }}
        className={cn(
          "fixed z-50 flex flex-col gap-4 overflow-y-auto border-0 bg-clip-padding text-sm outline-none",
          isPage
            ? "inset-0 h-svh max-h-svh w-full max-w-none rounded-none bg-background text-foreground shadow-none ring-0"
            : isHalf
              ? cn(
                  "inset-x-0 bottom-0 top-auto h-[min(62svh,34rem)] max-h-[min(70svh,calc(100%-3rem))] w-full max-w-none",
                  "rounded-t-[1.75rem] rounded-b-none bg-background text-foreground shadow-[var(--shadow-card)] ring-1 ring-border/40",
                )
              : cn(
                "max-h-[min(90svh,calc(100%-2rem))] bg-card text-card-foreground",
                "rounded-[1.75rem] shadow-[var(--shadow-card)] ring-1 ring-border/40",
                // Bottom-anchored floating card (forms, most sheets)
                "data-[side=bottom]:inset-x-4 data-[side=bottom]:bottom-[max(1rem,env(safe-area-inset-bottom))] data-[side=bottom]:top-auto data-[side=bottom]:mx-auto data-[side=bottom]:w-auto data-[side=bottom]:max-w-md",
                // Side floating cards
                "data-[side=left]:top-[max(1rem,env(safe-area-inset-top))] data-[side=left]:bottom-[max(1rem,env(safe-area-inset-bottom))] data-[side=left]:left-4 data-[side=left]:right-auto data-[side=left]:w-[min(22rem,calc(100%-2rem))]",
                "data-[side=right]:top-[max(1rem,env(safe-area-inset-top))] data-[side=right]:bottom-[max(1rem,env(safe-area-inset-bottom))] data-[side=right]:right-4 data-[side=right]:left-auto data-[side=right]:w-[min(22rem,calc(100%-2rem))]",
                // Top floating card
                "data-[side=top]:inset-x-4 data-[side=top]:top-[max(1rem,env(safe-area-inset-top))] data-[side=top]:bottom-auto data-[side=top]:mx-auto data-[side=top]:w-auto data-[side=top]:max-w-md",
              ),
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-3 right-3 z-10 rounded-full"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 px-5 pt-5 pb-1", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 px-5 pb-5 pt-2", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-semibold text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
