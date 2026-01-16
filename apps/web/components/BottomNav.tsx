// components/BottomNav.tsx
"use client";

import Link from "next/link";
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

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-6 pb-8 pt-4">
      <div className="bg-white/80 backdrop-blur-2xl border border-slate-100 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] px-4 py-2 max-w-md mx-auto relative flex items-center justify-between">
        {NAV_ITEMS.slice(0, 2).map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 min-w-[64px] transition-all duration-300",
                isActive ? "text-brand-green" : "text-slate-400"
              )}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 3 : 2}
                className={cn("transition-transform duration-500", isActive && "scale-110")}
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
          className="w-16 h-16 bg-brand-green text-white rounded-full shadow-2xl shadow-brand-green/40 flex items-center justify-center -translate-y-8 active:scale-90 transition-transform duration-300 border-4 border-white"
        >
          <Plus size={32} strokeWidth={3} />
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
                isActive ? "text-brand-green" : "text-slate-400"
              )}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 3 : 2}
                className={cn("transition-transform duration-500", isActive && "scale-110")}
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
    </div>
  );
}

