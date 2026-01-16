// components/BottomNav.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, GraduationCap, User, Plus } from "lucide-react";
import { cn } from "../lib/utils";

const NAV_ITEMS = [
  {
    label: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Schedule",
    href: "/calendar",
    icon: Calendar,
  },
  // We'll insert the FAB here
  {
    label: "Courses",
    href: "/courses",
    icon: GraduationCap,
  },
  {
    label: "Profile",
    href: "/profile",
    icon: User,
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => setIsOpen(false), 5000);
    return () => clearTimeout(timer);
  }, [isOpen]);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-6">
      <div
        className={cn(
          "mx-auto max-w-md rounded-[2.5rem] border border-brand-border bg-brand-surface/90 backdrop-blur-2xl shadow-soft transition-all duration-300",
          isOpen ? "px-4 py-3" : "px-3 py-2 w-[140px]"
        )}
      >
        {!isOpen ? (
          <button
            onClick={() => setIsOpen(true)}
            className="w-full flex items-center justify-center text-brand-muted text-[14px] font-black tracking-[0.4em]"
            aria-label="Open navigation"
          >
            ~~~
          </button>
        ) : (
          <div className="relative flex items-center justify-between">
            {NAV_ITEMS.slice(0, 2).map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-2 min-w-[64px] transition-all duration-300",
                    isActive ? "text-brand-primary" : "text-brand-muted"
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.5 : 2}
                    className={cn("transition-transform duration-500", isActive && "scale-105")}
                  />
                  <span className={cn(
                    "text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-300",
                    isActive ? "opacity-100" : "opacity-0"
                  )}>
                    {item.label}
                  </span>
                </Link>
              );
            })}

            {/* Central FAB */}
            <Link
              href="/quick-add"
              aria-label="Quick add"
              onClick={() => setIsOpen(false)}
              className="w-14 h-14 bg-brand-primary text-white rounded-full shadow-soft flex items-center justify-center -translate-y-6 active:scale-90 transition-transform duration-300 border-4 border-brand-gesso"
            >
              <Plus size={26} strokeWidth={3} />
            </Link>

            {NAV_ITEMS.slice(2).map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-2 min-w-[64px] transition-all duration-300",
                    isActive ? "text-brand-primary" : "text-brand-muted"
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.5 : 2}
                    className={cn("transition-transform duration-500", isActive && "scale-105")}
                  />
                  <span className={cn(
                    "text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-300",
                    isActive ? "opacity-100" : "opacity-0"
                  )}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

