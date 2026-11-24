import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
  " hover-elevate active-elevate-2" +
  // Storefront only — the admin area keeps the original button exactly.
  " store:rounded-full store:font-semibold store:select-none store:hover:-translate-y-0.5 store:transition-[background-color,border-color,color,box-shadow,transform] store:duration-200 store:ease-out store:active:translate-y-0 store:active:scale-[0.97]" +
  " store:focus-visible:ring-2 store:focus-visible:ring-offset-2 store:focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary-border store:border-primary store:shadow-[0_18px_40px_-22px_rgba(179,18,92,0.55)] store:hover:bg-berry store:hover:border-berry",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive-border store:hover:bg-destructive/90",
        outline:
          // Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color.
          " border [border-color:var(--button-outline)]  shadow-xs active:shadow-none store:border-foreground/20 store:hover:border-foreground store:hover:bg-foreground store:hover:text-background",
        secondary: "border bg-secondary text-secondary-foreground border border-secondary-border store:hover:bg-foreground/[0.1]",
        // Add a transparent border so that when someone toggles a border on later, it doesn't shift layout/size.
        ghost: "border border-transparent store:hover:bg-foreground/[0.06]",
      },
      // Heights are set as "min" heights, because sometimes Ai will place large amount of content
      // inside buttons. With a min-height they will look appropriate with small amounts of content,
      // but will expand to fit large amounts of content.
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs store:rounded-full store:px-4",
        lg: "min-h-10 rounded-md px-8 store:rounded-full store:min-h-12",
        icon: "h-9 w-9 store:rounded-full",
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
