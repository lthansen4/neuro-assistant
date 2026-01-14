"use client";

import { useState, useEffect } from "react";
import { X, Clock, BookOpen, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { useToast } from "./ui/use-toast";

interface Nudge {
  id: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  triggerAt: string;
  status: string;
  metadata?: any;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

export function PostClassNudgeBanner({ userId }: { userId: string }) {
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showFocusInput, setShowFocusInput] = useState(false);
  const [focusMinutes, setFocusMinutes] = useState<number>(0);
  const [focusDescription, setFocusDescription] = useState("");
  const { toast } = useToast();

  // Fetch pending nudges
  const fetchNudges = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/nudges/pending`, {
        headers: {
          'x-clerk-user-id': userId
        }
      });
      const data = await res.json();
      
      if (data.ok && data.nudges.length > 0) {
        setNudges(data.nudges);
        setVisible(true);
      } else {
        setVisible(false);
      }
    } catch (error) {
      console.error('[PostClassNudgeBanner] Error fetching nudges:', error);
    }
  };

  // Fetch on mount and every 30 seconds
  useEffect(() => {
    fetchNudges();
    const interval = setInterval(fetchNudges, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  // Handle nudge action
  const handleAction = async (nudgeId: string, action: string, payload?: any) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/nudges/${nudgeId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-clerk-user-id': userId
        },
        body: JSON.stringify({ action, payload })
      });

      const data = await res.json();
      
      if (data.ok) {
        toast({
          title: "✅ Logged!",
          description: `${action === 'NO_UPDATES' ? 'No updates recorded' : action === 'LOG_FOCUS' ? `${payload.focusMinutes} min focus logged: ${payload.description || ''}` : 'Assignment added'}. 🔥 Streak: ${data.streak.current}`,
          duration: 3000
        });
        
        // Remove this nudge from the list
        setNudges(prev => prev.filter(n => n.id !== nudgeId));
        
        // If no more nudges, hide banner
        if (nudges.length <= 1) {
          setVisible(false);
        }
        
        // Refresh calendar to show new focus block
        window.dispatchEvent(new Event('refreshCalendar'));
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to log action",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('[PostClassNudgeBanner] Error resolving nudge:', error);
      toast({
        title: "Error",
        description: "Failed to log action. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle focus button click - show input first
  const handleFocusClick = (minutes: number) => {
    setFocusMinutes(minutes);
    setShowFocusInput(true);
  };

  // Submit focus with description
  const handleFocusSubmit = () => {
    if (!focusDescription.trim()) {
      toast({
        title: "Description required",
        description: "Please enter what you're studying",
        variant: "destructive"
      });
      return;
    }

    const nudge = nudges[0];
    handleAction(nudge.id, 'LOG_FOCUS', { 
      focusMinutes, 
      description: focusDescription.trim(),
      courseId: nudge.courseId,
      courseName: nudge.courseName
    });
    
    // Reset
    setShowFocusInput(false);
    setFocusDescription("");
    setFocusMinutes(0);
  };

  // Don't render if no nudges or not visible
  if (!visible || nudges.length === 0) {
    return null;
  }

  const nudge = nudges[0]; // For MVP, show one at a time

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-md">
      <Card className="p-4 shadow-lg border-2 border-blue-500 bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-400" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Update {nudge.courseCode}?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {nudge.courseName}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => handleAction(nudge.id, 'DISMISSED')}
            disabled={loading}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick message */}
        <p className="text-sm text-gray-300 mb-4">
          Class just ended. Any updates?
        </p>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => handleAction(nudge.id, 'NO_UPDATES')}
            disabled={loading}
            variant="outline"
            className="w-full justify-start bg-gray-800 hover:bg-gray-700 text-white border-gray-600"
          >
            <span className="mr-2">✅</span>
            No updates
          </Button>

          <Button
            onClick={() => {
              // For MVP: Open Quick Add with course pre-filled
              // This will be integrated in next todo
              window.dispatchEvent(new CustomEvent('openQuickAdd', { 
                detail: { courseId: nudge.courseId, courseName: nudge.courseName } 
              }));
              handleAction(nudge.id, 'ADD_ASSIGNMENT');
            }}
            disabled={loading}
            variant="outline"
            className="w-full justify-start bg-gray-800 hover:bg-gray-700 text-white border-gray-600"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add assignment
          </Button>

          <div className="flex gap-2">
            <Button
              onClick={() => handleFocusClick(25)}
              disabled={loading}
              variant="outline"
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white border-gray-600"
            >
              <BookOpen className="h-4 w-4 mr-1" />
              25m
            </Button>
            <Button
              onClick={() => handleFocusClick(50)}
              disabled={loading}
              variant="outline"
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white border-gray-600"
            >
              <BookOpen className="h-4 w-4 mr-1" />
              50m
            </Button>
            <Button
              onClick={() => handleFocusClick(90)}
              disabled={loading}
              variant="outline"
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white border-gray-600"
            >
              <BookOpen className="h-4 w-4 mr-1" />
              90m
            </Button>
          </div>
        </div>

        {/* Multiple nudges indicator */}
        {nudges.length > 1 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <Badge variant="secondary" className="text-xs">
              +{nudges.length - 1} more
            </Badge>
          </div>
        )}

        {/* Focus Input Popup */}
        {showFocusInput && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-700">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
              What will you study/review? ({focusMinutes} min)
            </p>
            <input
              type="text"
              value={focusDescription}
              onChange={(e) => setFocusDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFocusSubmit();
                } else if (e.key === 'Escape') {
                  setShowFocusInput(false);
                  setFocusDescription("");
                }
              }}
              placeholder="e.g., Chapter 5 reading, Practice problems 1-10"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <Button
                onClick={handleFocusSubmit}
                disabled={!focusDescription.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Schedule
              </Button>
              <Button
                onClick={() => {
                  setShowFocusInput(false);
                  setFocusDescription("");
                }}
                variant="outline"
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white border-gray-600"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

