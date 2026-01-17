"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { CircularProgress } from "./ui/CircularProgress";
import { createSession } from "../lib/api";
import { toast } from "./ui/Toast";
import { PostSessionSummaryModal } from "./PostSessionSummaryModal";

export function FocusTimerModal({
  userId,
  assignmentId,
  title,
  category,
  currentPagesCompleted,
  totalPages,
  onClose,
  onLogged,
}: {
  userId: string;
  assignmentId?: string | null;
  title?: string;
  category?: string | null;
  currentPagesCompleted?: number | null;
  totalPages?: number | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [startTime] = useState<Date>(new Date());
  const [now, setNow] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [sessionData, setSessionData] = useState<{ start: string; end: string; minutes: number } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedMs = now.getTime() - startTime.getTime();
  const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));
  const elapsedSeconds = Math.max(1, Math.round(elapsedMs / 1000));

  const formatted = useMemo(() => {
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [elapsedMs]);

  const handleStop = async () => {
    setSaving(true);
    setError(null);
    const endTime = new Date();
    const minutes = Math.round(elapsedMs / 60000);
    
    try {
      await createSession(userId, {
        type: "Focus",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        assignmentId: assignmentId || null,
      });
      
      setSessionData({
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        minutes
      });
      setShowSummary(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to log session");
      setError(err.message || "Failed to log focus session.");
      setSaving(false);
    }
  };

  if (showSummary && sessionData) {
    return (
      <PostSessionSummaryModal
        isOpen={true}
        onClose={() => {
          setShowSummary(false);
          onLogged();
        }}
        startTime={sessionData.start}
        endTime={sessionData.end}
        actualMinutes={sessionData.minutes}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[120]" onClick={onClose}>
      <div
        className="bg-white rounded-[2rem] shadow-xl max-w-md w-full mx-4 p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-brand-text">Lock In</h2>
            {title && <p className="text-sm text-brand-muted">{title}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-brand-muted hover:text-brand-text text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col items-center gap-4">
          <CircularProgress
            value={elapsedSeconds % 60}
            max={60}
            size={180}
            strokeWidth={12}
            color="#6D5EF7"
            backgroundColor="#F6F2EA"
          >
            <div className="flex flex-col items-center">
              <span className="text-4xl font-serif font-black text-brand-text">{formatted}</span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-muted mt-1">
                Focus
              </span>
            </div>
          </CircularProgress>
          <div className="text-sm text-brand-muted">
            {elapsedMinutes} minute{elapsedMinutes === 1 ? "" : "s"} logged
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleStop} disabled={saving}>
            {saving ? "Saving..." : "Stop + Log"}
          </Button>
        </div>
      </div>
    </div>
  );
}

