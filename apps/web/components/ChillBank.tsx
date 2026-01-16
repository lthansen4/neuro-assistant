// components/ChillBank.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { CircularProgress } from "./ui/CircularProgress";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { createSession } from "../lib/api";
import { toast } from "./ui/Toast";

interface ChillBankProps {
  userId: string;
  earnedMinutes: number;
  usedMinutes: number;
  targetRatio?: number;
  onSessionLogged?: () => void;
}

const focusStorageKey = "gesso_focus_timer";
const chillStorageKey = "gesso_chill_timer";

export function ChillBank({
  userId,
  earnedMinutes,
  usedMinutes,
  targetRatio = 3.0,
  onSessionLogged,
}: ChillBankProps) {
  const available = earnedMinutes - usedMinutes;
  const percentage = earnedMinutes > 0 ? Math.min(100, (available / earnedMinutes) * 100) : 0;
  
  const progressColor = "#F08A5D"; // Category Reset FG
  const bgColor = "rgba(240,138,93,0.14)"; // Category Reset BG
  const focusColor = "#6D5EF7";

  const [now, setNow] = useState(new Date());
  const [focusStart, setFocusStart] = useState<string | null>(null);
  const [focusRunning, setFocusRunning] = useState(false);
  const [chillStart, setChillStart] = useState<string | null>(null);
  const [chillDurationSec, setChillDurationSec] = useState(0);
  const [chillRunning, setChillRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const storedFocus = localStorage.getItem(focusStorageKey);
      if (storedFocus) {
        const data = JSON.parse(storedFocus);
        setFocusStart(data.startTime);
        setFocusRunning(data.isRunning);
      }
      const storedChill = localStorage.getItem(chillStorageKey);
      if (storedChill) {
        const data = JSON.parse(storedChill);
        setChillStart(data.startTime);
        setChillDurationSec(data.durationSec);
        setChillRunning(data.isRunning);
      }
    } catch {
      // ignore storage parse errors
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      focusStorageKey,
      JSON.stringify({ startTime: focusStart, isRunning: focusRunning })
    );
  }, [focusStart, focusRunning]);

  useEffect(() => {
    localStorage.setItem(
      chillStorageKey,
      JSON.stringify({ startTime: chillStart, durationSec: chillDurationSec, isRunning: chillRunning })
    );
  }, [chillStart, chillDurationSec, chillRunning]);

  const focusElapsedSec = focusRunning && focusStart ? Math.max(0, Math.floor((now.getTime() - new Date(focusStart).getTime()) / 1000)) : 0;
  const focusMinutes = Math.max(1, Math.round(focusElapsedSec / 60));

  const chillElapsedSec = chillRunning && chillStart ? Math.max(0, Math.floor((now.getTime() - new Date(chillStart).getTime()) / 1000)) : 0;
  const chillRemainingSec = Math.max(0, chillDurationSec - chillElapsedSec);
  const chillRemainingMinutes = Math.max(0, Math.ceil(chillRemainingSec / 60));

  const formatClock = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startFocus = () => {
    setError(null);
    if (focusRunning) return;
    setFocusStart(new Date().toISOString());
    setFocusRunning(true);
  };

  const stopFocus = async () => {
    if (!focusStart) return;
    setError(null);
    const focusMinutes = Math.round((new Date().getTime() - new Date(focusStart).getTime()) / 60000);
    try {
      await createSession(userId, {
        type: "Focus",
        startTime: focusStart,
        endTime: new Date().toISOString(),
      });
      toast.success(`Focus logged! ${focusMinutes}m earned 🔥`);
      setFocusRunning(false);
      setFocusStart(null);
      onSessionLogged?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to log session");
      setError(e.message || "Failed to log focus session.");
    }
  };

  const startChill = () => {
    setError(null);
    if (chillRunning) return;
    const availableMinutes = Math.max(0, Math.floor(available));
    if (availableMinutes <= 0) {
      setError("No chill minutes available yet.");
      return;
    }
    setChillStart(new Date().toISOString());
    setChillDurationSec(availableMinutes * 60);
    setChillRunning(true);
  };

  const stopChill = async (autoComplete = false) => {
    if (!chillStart) return;
    setError(null);
    const endTime = autoComplete
      ? new Date(new Date(chillStart).getTime() + chillDurationSec * 1000).toISOString()
      : new Date().toISOString();
    const chillMinutes = Math.round((new Date(endTime).getTime() - new Date(chillStart).getTime()) / 60000);
    try {
      await createSession(userId, {
        type: "Chill",
        startTime: chillStart,
        endTime,
      });
      toast.success(`Chill session logged! ${chillMinutes}m redeemed 🌊`);
      setChillRunning(false);
      setChillStart(null);
      setChillDurationSec(0);
      onSessionLogged?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to log session");
      setError(e.message || "Failed to log chill session.");
    }
  };

  useEffect(() => {
    if (chillRunning && chillRemainingSec <= 0 && chillDurationSec > 0) {
      stopChill(true);
    }
  }, [chillRunning, chillRemainingSec, chillDurationSec]);

  return (
    <div className="bg-brand-surface p-10 rounded-[2.5rem] cozy-border shadow-soft hover:shadow-2xl transition-all duration-500 group flex flex-col justify-between">
      <div className="flex flex-col items-center">
        <div className="w-full flex justify-between items-center mb-6">
          <h3 className="card-title text-brand-text italic">Chill Bank</h3>
          <span className="meta-label text-brand-muted">Rest Balance</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full">
          <div className="flex flex-col items-center gap-5">
            <CircularProgress
              value={focusElapsedSec % 60}
              max={60}
              size={160}
              strokeWidth={10}
              color={`${focusColor}AA`}
              backgroundColor="rgba(109,94,247,0.12)"
            >
              <div className="flex flex-col items-center">
                <span className="text-3xl font-serif font-black text-brand-text tracking-tighter">
                  {focusRunning ? `${focusMinutes}m` : "0m"}
                </span>
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-muted mt-2">
                  Focus
                </span>
              </div>
            </CircularProgress>
            <Button
              onClick={focusRunning ? stopFocus : startFocus}
              className="rounded-full px-8 py-3 text-[11px] font-black uppercase tracking-[0.2em] bg-brand-primary text-white shadow-soft hover:brightness-110"
            >
              {focusRunning ? "Stop" : "Lock In"}
            </Button>
          </div>

          <div className="flex flex-col items-center gap-5">
            <CircularProgress
              value={chillRunning ? chillRemainingSec : Math.max(0, Math.floor(available) * 60)}
              max={Math.max(1, Math.floor(available) * 60)}
              size={160}
              strokeWidth={10}
              color="rgba(240,138,93,0.75)"
              backgroundColor={bgColor}
            >
              <div className="flex flex-col items-center">
                <span className="text-3xl font-serif font-black text-brand-text tracking-tighter">
                  {chillRunning ? formatClock(chillRemainingSec) : `${Math.floor(available)}m`}
                </span>
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-muted mt-2">
                  Chill
                </span>
              </div>
            </CircularProgress>
            <Button
              onClick={chillRunning ? () => stopChill(false) : startChill}
              className="rounded-full px-8 py-3 text-[11px] font-black uppercase tracking-[0.2em] bg-brand-surface-2 text-brand-text shadow-soft hover:brightness-105"
              disabled={!chillRunning && Math.floor(available) <= 0}
            >
              {chillRunning ? "Stop" : "Redeem"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 w-full mt-8 pt-6 border-t border-brand-surface-2">
          <div className="text-center">
            <div className="meta-label text-brand-muted mb-1">Earned</div>
            <div className="text-xl font-bold text-brand-text">{Math.floor(earnedMinutes)}m</div>
          </div>
          <div className="text-center">
            <div className="meta-label text-brand-muted mb-1">Used</div>
            <div className="text-xl font-bold text-brand-text">{Math.floor(usedMinutes)}m</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {targetRatio && (
        <div className="mt-6 flex items-center justify-center gap-3 w-full opacity-30">
          <div className="h-px flex-1 bg-brand-muted/20"></div>
          <p className="text-[10px] font-bold text-brand-muted uppercase tracking-[0.2em]">
            1:{targetRatio} Focus Ratio
          </p>
          <div className="h-px flex-1 bg-brand-muted/20"></div>
        </div>
      )}
    </div>
  );
}
