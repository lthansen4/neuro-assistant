"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { createSession } from "../lib/api";

export function FocusTimerModal({
  userId,
  assignmentId,
  title,
  onClose,
  onLogged,
}: {
  userId: string;
  assignmentId?: string | null;
  title?: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [startTime] = useState<Date>(new Date());
  const [now, setNow] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedMs = now.getTime() - startTime.getTime();
  const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));

  const formatted = useMemo(() => {
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [elapsedMs]);

  const handleStop = async () => {
    setSaving(true);
    setError(null);
    try {
      await createSession(userId, {
        type: "Focus",
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        assignmentId: assignmentId || null,
      });
      onLogged();
    } catch (err: any) {
      setError(err.message || "Failed to log focus session.");
    } finally {
      setSaving(false);
    }
  };

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

        <div className="flex flex-col items-center gap-3">
          <div className="text-5xl font-serif font-black text-brand-text">{formatted}</div>
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

