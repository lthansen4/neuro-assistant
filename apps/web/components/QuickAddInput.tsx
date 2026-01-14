"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { Input } from "./ui/input";
import { QuickAddPreviewSheet } from "./QuickAddPreviewSheet";
import { Sparkles } from "lucide-react";

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
      // Pre-fill with course name and focus input
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
      // Call the parse endpoint
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
    // Clear input and close sheet
    setText("");
    setIsOpen(false);
    setParseResult(null);
    
    // Trigger a custom event to notify the calendar to refresh
    // This avoids a full page reload
    window.dispatchEvent(new CustomEvent('refreshCalendar'));
    
    // Show a success message
    console.log('[QuickAddInput] Assignment created successfully!');
  };

  const handleClose = () => {
    setIsOpen(false);
    setParseResult(null);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="relative w-full">
        <div className="relative">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-500 animate-pulse" />
          <Input
            ref={inputRef}
            id="quick-add-input"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type anything: 'cs homework due monday' ✨"
            disabled={isParsing || !isLoaded}
            className="pl-10 pr-4 py-3 w-full bg-white dark:bg-gray-800 border-2 border-blue-400 dark:border-blue-600 rounded-lg text-base text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-md"
          />
        </div>
        {isParsing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
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

