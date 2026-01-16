"use client";

import React from "react";
import { cn } from "../lib/utils";

interface WeekSummaryProps {
  completedCount: number;
  totalScheduled: number;
}

export function WeekSummary({ completedCount, totalScheduled }: WeekSummaryProps) {
  const percentage = totalScheduled > 0 ? Math.round((completedCount / totalScheduled) * 100) : 0;

  return (
    <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft space-y-6">
      <div className="space-y-1">
        <h3 className="card-title text-brand-text italic">This Week</h3>
        <p className="meta-label text-brand-muted">The progress report</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <span className="text-5xl font-serif font-black text-brand-primary">{completedCount}</span>
          <span className="text-brand-muted font-bold text-sm pb-1">/ {totalScheduled} done</span>
        </div>

        <div className="space-y-2">
          <div className="w-full h-2 bg-brand-surface-2 rounded-full overflow-hidden">
            <div 
              className="h-full bg-brand-primary transition-all duration-1000 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-[12px] font-bold text-brand-muted uppercase tracking-wider">
            {percentage}% through your plan
          </p>
        </div>
      </div>
    </div>
  );
}

