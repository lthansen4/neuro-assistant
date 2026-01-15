import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "link"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-2xl text-sm font-black uppercase tracking-widest transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/20 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
          variant === "default" && "bg-brand-green text-white shadow-lg shadow-brand-green/20 hover:bg-brand-green/90",
          variant === "outline" && "border-2 border-slate-100 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-200",
          variant === "ghost" && "text-slate-400 hover:text-slate-600 hover:bg-slate-50",
          variant === "link" && "underline-offset-4 hover:underline text-brand-green",
          "h-14 px-8",
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


