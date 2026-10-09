"use client"

import { useRef, useEffect } from "react"
import { usePathname } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, XCircle, Info } from "lucide-react"

const TOAST_DURATION = 4000

export function Toaster() {
  const { toasts, dismiss } = useToast()
  // The POS is a fullscreen checkout screen the cashier watches head-on, so its
  // toasts sit top-center where they are in view. Back-office keeps top-right.
  const pathname = usePathname()
  const isPos = pathname?.startsWith('/pos') ?? false

  const wasLoadingRef   = useRef(new Set<string>())
  const dismissTimerRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    toasts.forEach((t) => {
      if (t.loading) {
        wasLoadingRef.current.add(t.id)
        const existing = dismissTimerRef.current.get(t.id)
        if (existing) { clearTimeout(existing); dismissTimerRef.current.delete(t.id) }
      } else if (wasLoadingRef.current.has(t.id) && !dismissTimerRef.current.has(t.id)) {
        wasLoadingRef.current.delete(t.id)
        const timer = setTimeout(() => {
          dismiss(t.id)
          dismissTimerRef.current.delete(t.id)
        }, 1600)
        dismissTimerRef.current.set(t.id, timer)
      }
    })
  }, [toasts, dismiss])

  return (
    <ToastProvider duration={TOAST_DURATION} swipeDirection={isPos ? "up" : "right"}>
      {toasts.map(({ id, title, description, action, loading, icon, variant, ...props }) => {
        const isLoading = !!loading

        const autoIcon = icon ?? (
          variant === 'destructive'
            ? <XCircle      className="h-4 w-4 text-red-400 shrink-0"      />
            : variant === 'success'
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0"  />
            : <Info         className="h-4 w-4 text-foreground/40 shrink-0" />
        )

        /* bar color matches variant */
        const barTrack = isLoading
          ? 'bg-blue-200 dark:bg-blue-900'
          : variant === 'destructive'  ? 'bg-red-400/30'
          : variant === 'success'      ? 'bg-emerald-300/50 dark:bg-emerald-800/50'
          : 'bg-primary/20'

        const barFill = isLoading
          ? 'bg-blue-500 dark:bg-blue-400 animate-toast-bar'
          : variant === 'destructive'  ? 'bg-red-400 animate-toast-progress origin-left'
          : variant === 'success'      ? 'bg-emerald-500 animate-toast-progress origin-left'
          : 'bg-primary animate-toast-progress origin-left'

        return (
          <Toast
            key={id}
            variant={isLoading ? 'loading' : variant}
            position={isPos ? 'top' : 'right'}
            duration={isLoading ? 999999999 : TOAST_DURATION}
            {...props}
          >
            {/* Content */}
            <div className="flex items-start gap-3 px-4 pt-3.5 pb-3 pr-9">
              {!isLoading && <div className="mt-px shrink-0">{autoIcon}</div>}
              <div className="flex-1 min-w-0">
                {title       && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
                {action      && <div className="mt-2">{action}</div>}
              </div>
            </div>

            {/* Close */}
            {!isLoading && <ToastClose />}

            {/* Progress / loading bar — always visible */}
            <div className={`h-[3px] w-full overflow-hidden ${barTrack}`}>
              <div className={`h-full ${isLoading ? 'w-1/2' : 'w-full'} ${barFill}`} />
            </div>
          </Toast>
        )
      })}
      <ToastViewport className={isPos ? "top-4 left-1/2 right-auto -translate-x-1/2 items-center" : undefined} />
    </ToastProvider>
  )
}
