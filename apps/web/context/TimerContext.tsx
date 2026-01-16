"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createSession } from "../lib/api";
import { toast } from "../components/ui/Toast";

interface TimerContextType {
  focusRunning: boolean;
  focusStart: string | null;
  focusMinutes: number;
  focusElapsedSec: number;
  
  chillRunning: boolean;
  chillStart: string | null;
  chillDurationSec: number;
  chillRemainingSec: number;
  chillRemainingMinutes: number;
  
  startFocus: (assignmentId?: string | null, assignmentTitle?: string | null) => void;
  stopFocus: (userId: string) => Promise<void>;
  
  startChill: (availableMinutes: number) => void;
  stopChill: (userId: string, autoComplete?: boolean) => Promise<void>;
  
  formatClock: (seconds: number) => string;
  activeTimer: "focus" | "chill" | null;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

const focusStorageKey = "gesso_focus_timer";
const chillStorageKey = "gesso_chill_timer";

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(new Date());
  
  const [focusStart, setFocusStart] = useState<string | null>(null);
  const [focusRunning, setFocusRunning] = useState(false);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState<string | null>(null);
  
  const [chillStart, setChillStart] = useState<string | null>(null);
  const [chillDurationSec, setChillDurationSec] = useState(0);
  const [chillRunning, setChillRunning] = useState(false);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load from storage
  useEffect(() => {
    try {
      const storedFocus = localStorage.getItem(focusStorageKey);
      if (storedFocus) {
        const data = JSON.parse(storedFocus);
        setFocusStart(data.startTime);
        setFocusRunning(data.isRunning);
        setAssignmentId(data.assignmentId || null);
        setAssignmentTitle(data.assignmentTitle || null);
      }
      const storedChill = localStorage.getItem(chillStorageKey);
      if (storedChill) {
        const data = JSON.parse(storedChill);
        setChillStart(data.startTime);
        setChillDurationSec(data.durationSec || 0);
        setChillRunning(data.isRunning);
      }
    } catch {
      // ignore
    }
  }, []);

  // Save to storage
  useEffect(() => {
    localStorage.setItem(
      focusStorageKey,
      JSON.stringify({ 
        startTime: focusStart, 
        isRunning: focusRunning,
        assignmentId,
        assignmentTitle
      })
    );
  }, [focusStart, focusRunning, assignmentId, assignmentTitle]);

  useEffect(() => {
    localStorage.setItem(
      chillStorageKey,
      JSON.stringify({ startTime: chillStart, durationSec: chillDurationSec, isRunning: chillRunning })
    );
  }, [chillStart, chillDurationSec, chillRunning]);

  // Derived Focus values
  const focusElapsedSec = focusRunning && focusStart ? Math.max(0, Math.floor((now.getTime() - new Date(focusStart).getTime()) / 1000)) : 0;
  const focusMinutes = Math.max(1, Math.round(focusElapsedSec / 60));

  // Derived Chill values
  const chillElapsedSec = chillRunning && chillStart ? Math.max(0, Math.floor((now.getTime() - new Date(chillStart).getTime()) / 1000)) : 0;
  const chillRemainingSec = Math.max(0, chillDurationSec - chillElapsedSec);
  const chillRemainingMinutes = Math.max(0, Math.ceil(chillRemainingSec / 60));

  const activeTimer = focusRunning ? "focus" : chillRunning ? "chill" : null;

  const formatClock = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startFocus = useCallback((id?: string | null, title?: string | null) => {
    if (chillRunning) {
      toast.error("Finish your chill session first!");
      return;
    }
    setFocusStart(new Date().toISOString());
    setFocusRunning(true);
    setAssignmentId(id || null);
    setAssignmentTitle(title || null);
  }, [chillRunning]);

  const stopFocus = useCallback(async (userId: string) => {
    if (!focusStart) return;
    const finalMinutes = Math.round((new Date().getTime() - new Date(focusStart).getTime()) / 60000);
    
    try {
      await createSession(userId, {
        type: "Focus",
        startTime: focusStart,
        endTime: new Date().toISOString(),
        assignmentId: assignmentId || null,
      });
      toast.success(`Focus logged! ${finalMinutes}m earned 🔥`);
      setFocusRunning(false);
      setFocusStart(null);
      setAssignmentId(null);
      setAssignmentTitle(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to log focus session");
      throw e;
    }
  }, [focusStart, assignmentId]);

  const startChill = useCallback((availableMinutes: number) => {
    if (focusRunning) {
      toast.error("Stop focusing before you chill!");
      return;
    }
    if (availableMinutes <= 0) {
      toast.error("No chill minutes available.");
      return;
    }
    setChillStart(new Date().toISOString());
    setChillDurationSec(availableMinutes * 60);
    setChillRunning(true);
  }, [focusRunning]);

  const stopChill = useCallback(async (userId: string, autoComplete = false) => {
    if (!chillStart) return;
    const endTime = autoComplete
      ? new Date(new Date(chillStart).getTime() + chillDurationSec * 1000).toISOString()
      : new Date().toISOString();
    const minutes = Math.round((new Date(endTime).getTime() - new Date(chillStart).getTime()) / 60000);
    
    try {
      await createSession(userId, {
        type: "Chill",
        startTime: chillStart,
        endTime,
      });
      toast.success(`Chill session logged! ${minutes}m redeemed 🌊`);
      setChillRunning(false);
      setChillStart(null);
      setChillDurationSec(0);
    } catch (e: any) {
      toast.error(e.message || "Failed to log chill session");
      throw e;
    }
  }, [chillStart, chillDurationSec]);

  // Handle auto-complete for chill
  useEffect(() => {
    // We need userId here, but stopChill is called from children where userId is available.
    // We can't auto-stop from here without userId unless we pass it to provider.
    // For now, ChillBank handles the auto-stop when it's mounted.
  }, [chillRunning, chillRemainingSec]);

  return (
    <TimerContext.Provider value={{
      focusRunning, focusStart, focusMinutes, focusElapsedSec,
      chillRunning, chillStart, chillDurationSec, chillRemainingSec, chillRemainingMinutes,
      startFocus, stopFocus,
      startChill, stopChill,
      formatClock,
      activeTimer
    }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (context === undefined) {
    throw new Error("useTimer must be used within a TimerProvider");
  }
  return context;
}

