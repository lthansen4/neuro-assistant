"use client";

import React from "react";
import { GessoIcon } from "./ui/GessoIcon";
import { cn } from "../lib/utils";

interface StuckAssignment {
  id: string;
  title: string;
  deferralCount?: number;
  isStuck?: boolean;
}

interface StuckRadarProps {
  assignments: StuckAssignment[];
}

export function StuckRadar({ assignments }: StuckRadarProps) {
  const stuckItems = assignments.filter(a => (a.deferralCount || 0) >= 3 || a.isStuck);

  return (
    <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft h-full space-y-6">
      <div className="flex items-center gap-3">
        <GessoIcon type="brick" size={24} className="text-category-wall-fg" />
        <h3 className="card-title text-brand-text italic">Stuck Radar</h3>
      </div>

      {stuckItems.length === 0 ? (
        <p className="text-brand-muted font-medium text-sm italic">
          No walls in sight. You're flowing. 🕊️
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-brand-muted font-medium text-sm">
            {stuckItems.length} item{stuckItems.length > 1 ? 's' : ''} feel{stuckItems.length === 1 ? 's' : ''} heavy today.
          </p>
          <div className="space-y-2">
            {stuckItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-category-wall-bg rounded-2xl border border-category-wall-fg/10">
                <span className="text-sm font-bold text-category-wall-fg truncate mr-2">{item.title}</span>
                <span className="text-[10px] font-black uppercase text-category-wall-fg/60 whitespace-nowrap">
                  {item.isStuck ? "flagged stuck" : `${item.deferralCount}x moved`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

