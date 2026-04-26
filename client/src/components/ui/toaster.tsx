import * as React from "react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import {
  ShoppingBag,
  Heart,
  ArrowLeftRight,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
} from "lucide-react"

const ICON_MAP: Record<string, React.ElementType> = {
  cart: ShoppingBag,
  heart: Heart,
  wishlist: Heart,
  exchange: ArrowLeftRight,
  error: AlertCircle,
  success: CheckCircle2,
}

function SwipeableToast({
  id,
  title,
  description,
  action,
  onDismiss,
  onClick,
  icon,
  variant,
  ...props
}: any) {
  const touchStartY = React.useRef<number | null>(null)
  const [offsetY, setOffsetY] = React.useState(0)
  const [dismissing, setDismissing] = React.useState<"up" | "down" | null>(null)
  const [pressing, setPressing] = React.useState(false)
  const [snapping, setSnapping] = React.useState(false)

  const THRESHOLD = 48

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    if (onClick) setPressing(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const delta = e.touches[0].clientY - touchStartY.current
    // Elastic resistance for downward swipes: dampen with square-root curve
    const clamped = delta < 0 ? delta : Math.sqrt(delta) * 6
    setOffsetY(clamped)
    if (Math.abs(delta) > 5) setPressing(false)
  }

  const handleTouchEnd = () => {
    setPressing(false)
    // Only dismiss when swiping UP past threshold
    if (offsetY < 0 && Math.abs(offsetY) >= THRESHOLD) {
      setDismissing("up")
      setTimeout(() => onDismiss(id), 250)
    } else {
      // Snap back with spring animation
      setSnapping(true)
      setOffsetY(0)
      setTimeout(() => setSnapping(false), 350)
    }
    touchStartY.current = null
  }

  const dismissStyle: React.CSSProperties = dismissing
    ? {
        transform: "translateY(-140%)",
        opacity: 0,
        transition: "transform 260ms cubic-bezier(.4,0,.2,1), opacity 260ms ease",
        pointerEvents: "none",
      }
    : snapping
    ? {
        transform: "translateY(0px)",
        transition: "transform 350ms cubic-bezier(.2,1.4,.4,1)",
      }
    : offsetY !== 0
    ? {
        transform: `translateY(${offsetY}px)`,
        opacity: offsetY < 0 ? Math.max(0, 1 - Math.abs(offsetY) / 140) : 1,
        transition: "none",
      }
    : {}

  const handleBodyClick = onClick
    ? () => {
        onClick()
        onDismiss(id)
      }
    : undefined

  const isDestructive = variant === "destructive"
  const IconComponent =
    icon && ICON_MAP[icon]
      ? ICON_MAP[icon]
      : isDestructive
      ? AlertCircle
      : CheckCircle2

  return (
    <div style={dismissStyle}>
      <Toast
        variant={variant}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          pressing && "scale-[0.97]",
          "transition-transform duration-75"
        )}
        {...props}
      >
        {/* Icon bubble */}
        <div
          className={cn(
            "shrink-0 flex items-center justify-center w-11 h-11 rounded-full sm:w-9 sm:h-9",
            isDestructive
              ? "bg-white/20"
              : "bg-muted text-foreground"
          )}
        >
          <IconComponent className="w-5 h-5 sm:w-4 sm:h-4" />
        </div>

        {/* Content */}
        <div
          className={cn("flex-1 min-w-0", onClick && "cursor-pointer")}
          onClick={handleBodyClick}
        >
          {title && <ToastTitle>{title}</ToastTitle>}
          {description && (
            <ToastDescription>{description}</ToastDescription>
          )}
        </div>

        {/* Chevron for clickable */}
        {onClick && (
          <div
            className="shrink-0 opacity-60 cursor-pointer"
            onClick={handleBodyClick}
          >
            <ChevronLeft className="w-4 h-4" />
          </div>
        )}

        {/* Close */}
        <ToastClose
          className={cn(
            isDestructive
              ? "text-destructive-foreground/70 hover:text-destructive-foreground"
              : "text-foreground/50 hover:text-foreground"
          )}
        />

        {action}
      </Toast>
    </div>
  )
}

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <ToastProvider swipeDirection="up" swipeThreshold={48}>
      {toasts.map(({ id, title, description, action, onClick, icon, variant, ...props }: any) => (
        <SwipeableToast
          key={id}
          id={id}
          title={title}
          description={description}
          action={action}
          onClick={onClick}
          icon={icon}
          variant={variant}
          onDismiss={dismiss}
          {...props}
        />
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
