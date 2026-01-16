// components/ui/Skeleton.tsx
"use client";

import { cn } from "../../lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-2xl bg-brand-surface-2/60", className)}
      {...props}
    />
  );
}

export function AssignmentCardSkeleton() {
  return (
    <div className="bg-brand-surface p-6 rounded-[2rem] cozy-border shadow-soft space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

export function BentoTileSkeleton() {
  return (
    <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-32 w-32 rounded-full mx-auto" />
        <Skeleton className="h-8 w-24 mx-auto" />
      </div>
    </div>
  );
}

export function TodayFlowSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="min-w-[280px] bg-brand-surface p-6 rounded-[2rem] cozy-border shadow-soft space-y-3"
        >
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="bg-brand-surface rounded-[2.5rem] p-8 cozy-border shadow-soft min-h-[75vh] space-y-4">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

