import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Shared feel for every button: quick colour/shadow transitions, a small press-in on click,
  // and a clear two-ring focus outline for keyboard users.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium select-none" +
  " transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.98]" +
  " focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" +
  " disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_18px_-10px_rgba(0,0,0,0.55)] hover:bg-primary/90 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_12px_22px_-10px_rgba(0,0,0,0.6)]",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive shadow-[0_8px_18px_-10px_hsl(var(--destructive)/0.7)] hover:bg-destructive/90",
        outline:
          // Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color.
          "border border-foreground/15 bg-transparent shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-foreground/35 hover:bg-foreground/[0.04] active:shadow-none",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground hover:bg-foreground/[0.1]",
        // Add a transparent border so that when someone toggles a border on later, it doesn't shift layout/size.
        ghost: "border border-transparent hover:bg-foreground/[0.06]",
      },
      // Heights are set as "min" heights, because sometimes Ai will place large amount of content
      // inside buttons. With a min-height they will look appropriate with small amounts of content,
      // but will expand to fit large amounts of content.
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-11 rounded-lg px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
