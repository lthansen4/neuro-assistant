"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { AlertCircle, CheckCircle2, Clock, BookOpen } from "lucide-react";
import { SmartQuestions } from "./SmartQuestions";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

interface QuickAddPreviewSheetProps {
  isOpen: boolean;
  onClose: () => void;
  parseResult: any;
  onSuccess: () => void;
  userId: string;
}

export function QuickAddPreviewSheet({
  isOpen,
  onClose,
  parseResult,
  onSuccess,
  userId,
}: QuickAddPreviewSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editedDraft, setEditedDraft] = useState(parseResult?.assignment_draft);
  const [editedFocusDraft, setEditedFocusDraft] = useState(parseResult?.focus_block_draft);
  const [smartAnswers, setSmartAnswers] = useState<Record<string, any>>({});
  const [smartQuestions, setSmartQuestions] = useState<any[]>(parseResult?.smart_questions || []);
  const [isRegeneratingQuestions, setIsRegeneratingQuestions] = useState(false);
  const lastDurationRef = useRef<number | null>(editedDraft?.estimated_duration ?? null);

  useEffect(() => {
    setEditedDraft(parseResult?.assignment_draft);
    setEditedFocusDraft(parseResult?.focus_block_draft);
    setSmartQuestions(parseResult?.smart_questions || []);
    setSmartAnswers({});
    lastDurationRef.current = parseResult?.assignment_draft?.estimated_duration ?? null;
  }, [parseResult]);

  useEffect(() => {
    if (!isOpen) return;
    const duration = editedDraft?.estimated_duration;
    if (!duration || duration <= 0) return;
    if (duration === lastDurationRef.current) return;

    const timer = setTimeout(async () => {
      setIsRegeneratingQuestions(true);
      try {
        const res = await fetch(`${API_BASE}/api/quick-add/questions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-clerk-user-id": userId,
          },
          body: JSON.stringify({
            assignment_draft: {
              title: editedDraft?.title,
              category: editedDraft?.category,
              due_at: editedDraft?.due_at,
              estimated_duration: duration,
            },
            user_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.smart_questions)) {
            setSmartQuestions(data.smart_questions);
            setSmartAnswers({});
          }
        }
      } catch (error) {
        console.error("[QuickAddPreviewSheet] Failed to regenerate questions:", error);
      } finally {
        setIsRegeneratingQuestions(false);
        lastDurationRef.current = duration;
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [
    editedDraft?.estimated_duration,
    editedDraft?.title,
    editedDraft?.category,
    editedDraft?.due_at,
    isOpen,
    userId
  ]);

  const handleConfirm = async () => {
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/quick-add/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-clerk-user-id': userId,
        },
        body: JSON.stringify({
          parse_id: parseResult.parse_id,
          assignment_draft: editedDraft,
          focus_block_draft: editedFocusDraft,
          on_duplicate: 'create', // Changed to 'create' to allow duplicate assignments for testing
          user_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          smart_answers: smartAnswers, // Include AI question answers
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create event');
      }

      const result = await res.json();
      
      // Dispatch custom event with creation details for success banner
      window.dispatchEvent(new CustomEvent('assignmentCreated', {
        detail: {
          assignment: result.assignment,
          focusBlocks: result.calendar_events || [],
          parseResult: parseResult
        }
      }));

      // Auto-trigger optimization for high-priority assignments
      if (result.assignment) {
        const assignment = result.assignment;
        const category = assignment.category;
        const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
        const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : Infinity;
        
        // High-priority if: Exam/Project, or due within 3 days
        const isHighPriority = 
          category === 'Exam' || 
          category === 'Project' ||
          category === 'Paper' ||
          daysUntilDue <= 3;
        
        if (isHighPriority) {
          console.log('[QuickAdd] High-priority assignment detected, triggering optimization...');
          
          // Small delay to let UI settle, then trigger optimization
          setTimeout(async () => {
            try {
              const optimizeRes = await fetch(`${API_BASE}/api/rebalancing/propose`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-clerk-user-id': userId,
                },
                body: JSON.stringify({ energyLevel: 5 })
              });
              
              if (optimizeRes.ok) {
                const optimizeData = await optimizeRes.json();
                if (optimizeData.ok && optimizeData.moves_count > 0) {
                  // Dispatch event to show optimization banner
                  window.dispatchEvent(new CustomEvent('optimizationReady', {
                    detail: {
                      movesCount: optimizeData.moves_count,
                      proposalId: optimizeData.proposal_id,
                      reason: 'High-priority assignment created'
                    }
                  }));
                }
              }
            } catch (error) {
              console.error('[QuickAdd] Auto-optimization failed:', error);
              // Silent fail - don't disrupt user flow
            }
          }, 1000);
        }
      }

      onSuccess();
    } catch (error) {
      console.error('[QuickAddPreviewSheet] Confirm error:', error);
      alert('Failed to create event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getConfidenceBadge = (confidence?: string) => {
    if (!confidence) return null;
    
    const colors = {
      high: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      low: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };

    return (
      <Badge className={`${colors[confidence as keyof typeof colors]} text-xs`}>
        {confidence}
      </Badge>
    );
  };

  const confidences = parseResult?.confidences || {};
  const suggestions = parseResult?.suggestions || {};
  const dedupe = parseResult?.dedupe;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-white dark:bg-gray-950">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <CheckCircle2 className="h-5 w-5 text-blue-500" />
            Confirm Event
          </SheetTitle>
          <SheetDescription className="text-gray-600 dark:text-gray-400">
            Review and edit the details before adding to your calendar
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Dedupe Warning */}
          {dedupe?.exists && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 border-2 border-yellow-400 dark:border-yellow-600 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-300 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                    Similar event exists
                  </p>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                    {dedupe.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Assignment Details */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">Title</Label>
                {getConfidenceBadge(confidences.title)}
              </div>
              <Input
                id="title"
                value={editedDraft?.title || ''}
                onChange={(e) => setEditedDraft({ ...editedDraft, title: e.target.value })}
                className={`text-base ${confidences.title === 'low' ? 'border-yellow-500' : ''}`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="course" className="text-sm font-semibold text-gray-900 dark:text-gray-100">Course</Label>
                {getConfidenceBadge(confidences.course_id)}
              </div>
              {suggestions.courses && suggestions.courses.length > 0 ? (
                <select
                  id="course"
                  value={editedDraft?.course_id || ''}
                  onChange={(e) => setEditedDraft({ ...editedDraft, course_id: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a course</option>
                  {suggestions.courses.map((course: any) => (
                    <option key={course.id} value={course.id}>
                      {course.code}: {course.name}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="course"
                  value={editedDraft?.course_id || 'No course'}
                  disabled
                  className="bg-gray-100 dark:bg-gray-800"
                />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="due_at" className="text-sm font-semibold text-gray-900 dark:text-gray-100">Due Date</Label>
                {getConfidenceBadge(confidences.due_at)}
              </div>
              <Input
                id="due_at"
                type="datetime-local"
                value={editedDraft?.due_at ? (() => {
                  const d = new Date(editedDraft.due_at);
                  const offset = d.getTimezoneOffset() * 60000; // offset in milliseconds
                  const localDate = new Date(d.getTime() - offset);
                  return localDate.toISOString().slice(0, 16);
                })() : ''}
                onChange={(e) => {
                  const newDate = new Date(e.target.value);
                  setEditedDraft({ 
                    ...editedDraft, 
                    due_at: isNaN(newDate.getTime()) ? editedDraft?.due_at : newDate.toISOString() 
                  });
                }}
                className={`text-base ${confidences.due_at === 'low' ? 'border-yellow-500' : ''}`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="category" className="text-sm font-semibold text-gray-900 dark:text-gray-100">Category</Label>
                {getConfidenceBadge(confidences.category)}
              </div>
              <select
                id="category"
                value={editedDraft?.category || 'Homework'}
                onChange={(e) => setEditedDraft({ ...editedDraft, category: e.target.value })}
                className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Homework">Homework</option>
                <option value="Exam">Exam</option>
                <option value="Reading">Reading</option>
                <option value="Study Session">Study Session</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="estimated_duration" className="text-sm font-semibold text-gray-900 dark:text-gray-100">Estimated Duration (minutes)</Label>
                {getConfidenceBadge(confidences.estimated_duration)}
              </div>
              <Input
                id="estimated_duration"
                type="number"
                value={editedDraft?.estimated_duration || ''}
                onChange={(e) => setEditedDraft({ ...editedDraft, estimated_duration: parseInt(e.target.value) || 0 })}
                className={`text-base ${confidences.estimated_duration === 'low' ? 'border-yellow-500' : ''}`}
              />
            </div>
          </div>

          {/* Focus Block Details */}
          {editedFocusDraft && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-400 dark:border-blue-600 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-300 flex-shrink-0" />
                <h3 className="text-base font-semibold text-blue-900 dark:text-blue-100">
                  {editedFocusDraft.chunked ? 'Focus Blocks (Auto-Scheduled - Multiple Sessions)' : 'Focus Block (Auto-Scheduled)'}
                </h3>
                {editedFocusDraft.chunked && editedFocusDraft.chunks && (
                  <Badge variant="secondary" className="ml-auto">
                    {editedFocusDraft.chunks.length} Sessions
                  </Badge>
                )}
              </div>
              
              {editedFocusDraft.chunked && editedFocusDraft.chunks ? (
                <div className="space-y-2">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    Large task detected - splitting into multiple work sessions:
                  </p>
                  {editedFocusDraft.chunks.map((chunk: any, idx: number) => (
                    <div key={idx} className="flex flex-col gap-1 text-sm border-l-2 border-blue-500 pl-3 py-2 bg-white dark:bg-gray-900 rounded">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-blue-900 dark:text-blue-100">{chunk.label}:</span>
                        <Badge variant="outline" className="text-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800">
                          {chunk.durationMinutes} min
                        </Badge>
                      </div>
                      <span className="text-gray-700 dark:text-gray-300">
                        {new Date(chunk.startAt).toLocaleDateString()} at {new Date(chunk.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                  
                  <div className="flex items-start gap-2 mt-2 p-3 bg-white dark:bg-gray-900 rounded border border-blue-200 dark:border-blue-700">
                    <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-300 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      These Focus blocks are spread across days with 8-hour rest periods between sessions to prevent mental fatigue.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-blue-900 dark:text-blue-100 space-y-1.5">
                  <p><strong>Title:</strong> {editedFocusDraft.title}</p>
                  <p><strong>Start:</strong> {new Date(editedFocusDraft.start_at).toLocaleString()}</p>
                  <p><strong>Duration:</strong> {editedFocusDraft.duration_minutes} minutes</p>

                  <div className="flex items-start gap-2 mt-2 p-3 bg-white dark:bg-gray-900 rounded border border-blue-200 dark:border-blue-700">
                    <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-300 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      This Focus block will be scheduled automatically to help you complete this task on time.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Smart Context-Aware Questions */}
          {smartQuestions && smartQuestions.length > 0 && (
            <SmartQuestions
              questions={smartQuestions}
              answers={smartAnswers}
              onAnswersChange={setSmartAnswers}
            />
          )}
          {isRegeneratingQuestions && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Updating questions based on your changes...
            </p>
          )}

          {/* Optional Description */}
          <div>
            <Label htmlFor="description" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Description (optional)
            </Label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              Add any extra context not covered above
            </p>
            <textarea
              id="description"
              value={editedDraft?.description || ''}
              onChange={(e) => setEditedDraft({ ...editedDraft, description: e.target.value })}
              placeholder="Any additional details..."
              rows={2}
              className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {isSubmitting ? 'Adding...' : '✨ Add & Schedule'}
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              disabled={isSubmitting}
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

