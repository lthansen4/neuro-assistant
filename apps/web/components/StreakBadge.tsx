// components/StreakBadge.tsx
"use client";

import { cn } from "../lib/utils";

interface Streak {
  currentCount: number;
  longestCount: number;
  lastIncrementedOn: string | null;
}

interface StreakBadgeProps {
  streak: Streak | null;
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  if (!streak) {
    return (
      <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft flex flex-col justify-center text-center space-y-2">
        <h3 className="card-title text-brand-text italic">Momentum</h3>
        <p className="text-brand-muted font-medium text-sm italic">Start your streak today! 🔥</p>
      </div>
    );
  }

  const isActive = streak.lastIncrementedOn
    ? new Date(streak.lastIncrementedOn).toDateString() === new Date().toDateString()
    : false;

  return (
    <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft space-y-8 group">
      <div className="flex items-center justify-between">
        <h3 className="card-title text-brand-text italic flex items-center gap-2">
          Streak {isActive && <span className="animate-bounce">🔥</span>}
        </h3>
        <span className="meta-label text-brand-muted">Activity</span>
      </div>
      
      <div className="flex items-center gap-10">
        <div className="text-center group-hover:scale-105 transition-transform duration-500">
          <div className="text-6xl font-serif font-black text-brand-amber tracking-tighter">
            {streak.currentCount}
          </div>
          <div className="meta-label text-brand-amber/60 mt-1">Days</div>
        </div>
        
        <div className="h-12 w-px bg-brand-surface-2"></div>
        
        <div className="text-center">
          <div className="text-2xl font-bold text-brand-muted tracking-tight">
            {streak.longestCount}
          </div>
          <div className="meta-label text-brand-muted/40 mt-1">Best</div>
        </div>
      </div>

      {isActive ? (
        <div className="bg-brand-amber/10 text-brand-amber text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-widest text-center border border-brand-amber/20">
          You're on fire today
        </div>
      ) : (
        <div className="bg-brand-surface-2 text-brand-muted/60 text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-widest text-center border border-brand-muted/10">
          Keep it going!
        </div>
      )}
    </div>
  );
}
