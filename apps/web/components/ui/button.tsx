import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "link" | "brand"
  size?: "default" | "sm" | "lg" | "xl"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-primary/10 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
          
          // Variants
          variant === "default" && "bg-brand-primary text-white shadow-soft hover:brightness-110",
          variant === "brand" && "bg-brand-primary text-white shadow-soft hover:brightness-110",
          variant === "outline" && "border border-brand-muted/20 bg-white/50 backdrop-blur-sm text-brand-text hover:bg-brand-surface",
          variant === "ghost" && "text-brand-muted hover:text-brand-text hover:bg-brand-surface-2",
          variant === "link" && "underline-offset-4 hover:underline text-brand-primary",
          
          // Sizes
          size === "default" && "h-12 px-8",
          size === "sm" && "h-10 px-6",
          size === "lg" && "h-14 px-10 text-[14px]",
          size === "xl" && "h-16 px-12 text-[16px]",
          
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
