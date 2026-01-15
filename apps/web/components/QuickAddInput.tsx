// components/QuickAddInput.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { Input } from "./ui/input";
import { QuickAddPreviewSheet } from "./QuickAddPreviewSheet";
import { Loader2 } from "lucide-react";
import { GessoIcon } from "./ui/GessoIcon";
import { cn } from "../lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

export function QuickAddInput() {
  const { user, isLoaded } = useUser();
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [parseResult, setParseResult] = useState<any>(null);
  const [isParsing, setIsParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Alt+Q to focus input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'q') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for post-class nudge "Add assignment" trigger
  useEffect(() => {
    const handleOpenQuickAdd = (e: CustomEvent) => {
      const { courseId, courseName } = e.detail;
      if (courseName) {
        setText(`${courseName} `);
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };

    window.addEventListener('openQuickAdd', handleOpenQuickAdd as EventListener);
    return () => window.removeEventListener('openQuickAdd', handleOpenQuickAdd as EventListener);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !isLoaded || !user) return;

    setIsParsing(true);

    try {
      const res = await fetch(`${API_BASE}/api/quick-add/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-clerk-user-id': user.id,
        },
        body: JSON.stringify({
          text: text.trim(),
          user_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          now: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to parse input');
      }

      const result = await res.json();
      setParseResult(result);
      setIsOpen(true);
    } catch (error) {
      console.error('[QuickAddInput] Parse error:', error);
      alert('Failed to parse input. Please try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSuccess = () => {
    setText("");
    setIsOpen(false);
    setParseResult(null);
    window.dispatchEvent(new CustomEvent('refreshCalendar'));
  };

  const handleClose = () => {
    setIsOpen(false);
    setParseResult(null);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="relative w-full group">
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
            {isParsing ? (
              <Loader2 className="h-5 w-5 text-brand-green animate-spin" />
            ) : (
              <GessoIcon type="inkblot" className="h-6 w-6 text-brand-green group-focus-within:animate-pulse" />
            )}
          </div>
          <Input
            ref={inputRef}
            id="quick-add-input"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hand over the chaos... I'll do the boring part."
            disabled={isParsing || !isLoaded}
            className={cn(
              "pl-12 pr-4 py-7 w-full transition-all duration-500",
              "bg-white/50 backdrop-blur-sm border border-slate-200/50 rounded-[2rem]",
              "text-lg font-black text-brand-blue placeholder:text-slate-300 placeholder:font-medium",
              "focus:ring-8 focus:ring-brand-green/5 focus:bg-white focus:shadow-2xl focus:shadow-brand-green/5 focus:border-brand-green/20"
            )}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-2 pointer-events-none opacity-30 group-focus-within:opacity-100 transition-opacity">
            <kbd className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-400 uppercase tracking-widest shadow-sm">Enter</kbd>
          </div>
        </div>
      </form>

      {parseResult && (
        <QuickAddPreviewSheet
          isOpen={isOpen}
          onClose={handleClose}
          parseResult={parseResult}
          onSuccess={handleSuccess}
          userId={user?.id || ''}
        />
      )}
    </>
  );
}
