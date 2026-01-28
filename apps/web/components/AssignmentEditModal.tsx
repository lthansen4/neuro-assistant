"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Tooltip } from "./ui/Tooltip";
import { cn } from "../lib/utils";
import { toast } from "./ui/Toast";
import { GessoIcon } from "./ui/GessoIcon";
import { Trash2, CheckCircle2, Save, X, Check, GraduationCap, Plus, Clock, Calendar } from "lucide-react";
import { toggleCalendarEventCompletion, fetchCourses } from "../lib/api";
import { PostSessionSummaryModal } from "./PostSessionSummaryModal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

export interface AssignmentEditData {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string | null;
  category: string | null;
  effortEstimateMinutes: number | null;
  status: "Inbox" | "Scheduled" | "Locked_In" | "Completed";
  courseId: string | null;
  courseName: string | null;
  pointsEarned?: number | null;
  pointsPossible?: number | null;
  graded?: boolean;
}

interface FocusBlock {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  metadata?: Record<string, any> | null;
}

function toLocalDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function AssignmentEditModal({
  assignment,
  userId,
  onClose,
  onUpdated,
  onDeleted,
}: {
  assignment: AssignmentEditData;
  userId: string;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(assignment.title);
  const [description, setDescription] = useState(assignment.description || "");
  const [dueDate, setDueDate] = useState(toLocalDateTimeValue(assignment.dueDate));
  const [category, setCategory] = useState(assignment.category || "");
  const [editCourseId, setEditCourseId] = useState(assignment.courseId || "");
  const [courses, setCourses] = useState<any[]>([]);
  const [effortMinutes, setEffortMinutes] = useState<string>(
    assignment.effortEstimateMinutes ? String(assignment.effortEstimateMinutes) : ""
  );
  const [pointsEarned, setPointsEarned] = useState<string>(
    assignment.pointsEarned ? String(assignment.pointsEarned) : ""
  );
  const [pointsPossible, setPointsPossible] = useState<string>(
    assignment.pointsPossible ? String(assignment.pointsPossible) : ""
  );
  const [graded, setGraded] = useState(assignment.graded || false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusBlocks, setFocusBlocks] = useState<FocusBlock[]>([]);
  const [loadingFocusBlocks, setLoadingFocusBlocks] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showScheduleMore, setShowScheduleMore] = useState(false);
  const [additionalMinutes, setAdditionalMinutes] = useState<string>("90");
  const [blockName, setBlockName] = useState<string>("");
  const [schedulingMore, setSchedulingMore] = useState(false);
  const [reschedulePreview, setReschedulePreview] = useState<{
    blockId: string;
    blockTitle: string;
    currentTime: string;
    newTime: string;
    reason: string;
    slotData: any;
  } | null>(null);
  const [schedulePreview, setSchedulePreview] = useState<{
    duration: number;
    blockName: string;
    proposedTime: string;
    reason: string;
    slotData: any;
  } | null>(null);

  useEffect(() => {
    const loadDetails = async () => {
      setLoadingFocusBlocks(true);
      try {
        const res = await fetch(`${API_BASE}/api/assignments/${assignment.id}/details`, {
          headers: { "x-clerk-user-id": userId },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          throw new Error(data.error || "Failed to load assignment details.");
        }
        setFocusBlocks(Array.isArray(data.focusBlocks) ? data.focusBlocks : []);
        
        // Update grade fields from backend data
        if (data.assignment) {
          if (data.assignment.pointsEarned !== null && data.assignment.pointsEarned !== undefined) {
            setPointsEarned(String(data.assignment.pointsEarned));
          }
          if (data.assignment.pointsPossible !== null && data.assignment.pointsPossible !== undefined) {
            setPointsPossible(String(data.assignment.pointsPossible));
          }
          if (data.assignment.graded !== undefined) setGraded(!!data.assignment.graded);
        }
      } catch (err) {
        console.error("[AssignmentEditModal] Failed to load focus blocks:", err);
      } finally {
        setLoadingFocusBlocks(false);
      }
    };

    loadDetails();
    
    const loadCourses = async () => {
      try {
        const data = await fetchCourses(userId);
        if (data.ok) {
          setCourses(data.items || []);
        }
      } catch (err) {
        console.error("[AssignmentEditModal] Failed to load courses:", err);
      }
    };
    loadCourses();
  }, [assignment.id, userId]);

  useEffect(() => {
    if (focusBlocks.length > 0) {
      window.dispatchEvent(new CustomEvent("highlightFocusBlocks", {
        detail: { eventIds: focusBlocks.map((block) => block.id) }
      }));
    }

    return () => {
      window.dispatchEvent(new CustomEvent("highlightFocusBlocks", {
        detail: { eventIds: [] }
      }));
    };
  }, [focusBlocks]);

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) {
      toast.error("Title is required");
      setError("Title is required.");
      return;
    }
    
    setSaving(true);
    const toastId = toast.loading("Saving assignment...");
    
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        category: category || null,
        courseId: editCourseId || null,
        effortEstimateMinutes: effortMinutes ? Number(effortMinutes) : null,
      };
      const res = await fetch(`${API_BASE}/api/assignments/${assignment.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to update assignment.");
      }

      const hasGradeInput = pointsEarned.trim() !== "" || pointsPossible.trim() !== "";
      const wantsClearGrade = graded && pointsEarned.trim() === "" && pointsPossible.trim() === "";

      // Save grade separately if grade fields are filled (or cleared)
      if (hasGradeInput || wantsClearGrade) {
        let gradePayload: { pointsEarned: number | null; pointsPossible: number | null; graded: boolean };

        if (wantsClearGrade) {
          gradePayload = { pointsEarned: null, pointsPossible: null, graded: false };
        } else {
          if (pointsEarned.trim() === "" || pointsPossible.trim() === "") {
            throw new Error("Please enter both points earned and points possible.");
          }

          const earnedValue = Number(pointsEarned);
          const possibleValue = Number(pointsPossible);

          if (!Number.isFinite(earnedValue) || !Number.isFinite(possibleValue)) {
            throw new Error("Grades must be valid numbers.");
          }
          if (possibleValue <= 0) {
            throw new Error("Points possible must be greater than 0.");
          }

          gradePayload = { pointsEarned: earnedValue, pointsPossible: possibleValue, graded: true };
        }

        const gradeRes = await fetch(`${API_BASE}/api/assignments/${assignment.id}/grade`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-clerk-user-id": userId,
          },
          body: JSON.stringify(gradePayload),
        });
        const gradeData = await gradeRes.json().catch(() => ({}));
        if (!gradeRes.ok || gradeData.error) {
          throw new Error(gradeData.error || "Failed to save grade.");
        }
        
        // Show course grade update if available
        if (gradeData.courseGrade) {
          toast.success(`Assignment saved! Course grade: ${gradeData.courseGrade.percentage}% (${gradeData.courseGrade.letterGrade})`);
        } else {
          toast.success("Assignment updated ✓");
        }
      } else {
        toast.success("Assignment updated ✓");
      }
      
      // Broadcast update to all views
      window.dispatchEvent(new CustomEvent('assignmentUpdated', {
        detail: { 
          assignmentId: assignment.id,
          updatedFields: payload 
        }
      }));
      
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save changes.");
      toast.error(err.message || "Failed to save assignment");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${assignment.title}"? This will remove related calendar events too.`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    
    // Optimistic: close modal immediately for snappiness
    onClose();
    toast.loading("Deleting assignment...");
    
    try {
      const res = await fetch(`${API_BASE}/api/assignments/${assignment.id}`, {
        method: "DELETE",
        headers: {
          "x-clerk-user-id": userId,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to delete assignment.");
      }
      toast.success("Assignment deleted ✓");
      onDeleted();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
      setError(err.message || "Failed to delete assignment.");
      setDeleting(false);
    }
  };

  const handleComplete = async () => {
    // UX: Instead of just marking done, open the summary wrap-up flow
    setShowSummary(true);
  };

  const handleToggleBlockComplete = async (blockId: string) => {
    try {
      const res = await toggleCalendarEventCompletion(userId, blockId);
      if (res.ok) {
        setFocusBlocks(prev => prev.map(b => 
          b.id === blockId 
            ? { ...b, metadata: { ...b.metadata, isCompleted: res.isCompleted } } 
            : b
        ));
        toast.success(res.isCompleted ? "Block marked done!" : "Block unmarked.");
        onUpdated(); // Refresh parent views to show completion status
      }
    } catch (err: any) {
      toast.error("Failed to update block status");
      console.error(err);
    }
  };

  const handleRescheduleBlock = async (blockId: string) => {
    const block = focusBlocks.find(b => b.id === blockId);
    if (!block) return;

    const start = new Date(block.startAt);
    const end = new Date(block.endAt);
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

    // First, find a new slot and show preview
    const loadingToast = toast.loading("Finding available time slots...");
    
    try {
      const res = await fetch(`${API_BASE}/api/calendar/events/${blockId}/reschedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
        body: JSON.stringify({
          durationMinutes,
          linkedAssignmentId: assignment.id,
          preview: true, // Request preview mode
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to find new time slot.");
      }

      // Dismiss loading toast
      toast.success("Found available slot!");

      // Show confirmation dialog with preview
      const newStart = new Date(data.event.startAt);
      const currentTimeStr = `${start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      const newTimeStr = `${newStart.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${newStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      
      setReschedulePreview({
        blockId,
        blockTitle: block.title,
        currentTime: currentTimeStr,
        newTime: newTimeStr,
        reason: data.reason || "Next available slot in your schedule",
        slotData: data.event,
      });

    } catch (err: any) {
      toast.error(err.message || "Failed to find new time slot");
      console.error(err);
    }
  };

  const confirmReschedule = async () => {
    if (!reschedulePreview) return;

    const { blockId, slotData } = reschedulePreview;

    // Update local state with new time
    setFocusBlocks(prev => prev.map(b => 
      b.id === blockId 
        ? { ...b, startAt: slotData.startAt, endAt: slotData.endAt } 
        : b
    ));

    toast.success(`Rescheduled to ${reschedulePreview.newTime}`);

    // Broadcast update to all views
    window.dispatchEvent(new CustomEvent('assignmentUpdated', {
      detail: { 
        assignmentId: assignment.id,
        action: 'reschedule',
        blockId 
      }
    }));
    
    setReschedulePreview(null);
    onUpdated();
  };

  const handleScheduleMoreTime = async (autoSchedule: boolean) => {
    if (!additionalMinutes || Number(additionalMinutes) <= 0) {
      toast.error("Please enter a valid duration");
      return;
    }

    if (!autoSchedule) {
      // Manual schedule: Show instructions
      toast.info("Go to Calendar view and tap an empty time slot to place this block");
      // Don't close the modal - let them see the duration/name they set
      setShowScheduleMore(false);
      return;
    }

    // Auto-schedule: Find slot and show preview
    setSchedulingMore(true);
    const loadingToast = toast.loading("Finding available time...");

    try {
      const res = await fetch(`${API_BASE}/api/assignments/${assignment.id}/schedule-more`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
        body: JSON.stringify({
          additionalMinutes: Number(additionalMinutes),
          blockName: blockName.trim() || null,
          preview: true, // Request preview mode
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to find available time.");
      }

      toast.success("Found available slot!");

      // Show confirmation dialog
      const proposedStart = new Date(data.event.startAt);
      const proposedTimeStr = `${proposedStart.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${proposedStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      
      setSchedulePreview({
        duration: Number(additionalMinutes),
        blockName: blockName.trim() || `Work on: ${assignment.title}`,
        proposedTime: proposedTimeStr,
        reason: data.reason || "Next available time in your schedule",
        slotData: data.event,
      });

    } catch (err: any) {
      toast.error(err.message || "Failed to find available time");
      console.error(err);
    } finally {
      setSchedulingMore(false);
    }
  };

  const confirmScheduleMore = async () => {
    if (!schedulePreview) return;

    try {
      // Now actually create the event (without preview mode)
      const res = await fetch(`${API_BASE}/api/assignments/${assignment.id}/schedule-more`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
        body: JSON.stringify({
          additionalMinutes: schedulePreview.duration,
          blockName: schedulePreview.blockName.startsWith("Work on:") ? null : schedulePreview.blockName,
          preview: false, // Actually create the event
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to create time block.");
      }

      // Add the new block to local state
      setFocusBlocks(prev => [...prev, {
        id: data.event.id,
        title: data.event.title,
        startAt: data.event.startAt,
        endAt: data.event.endAt,
        metadata: data.event.metadata || {},
      }]);

      toast.success(`Scheduled for ${schedulePreview.proposedTime}`);

      // Broadcast update to all views
      window.dispatchEvent(new CustomEvent('assignmentUpdated', {
        detail: { 
          assignmentId: assignment.id,
          action: 'schedule-more',
          newEventId: data.event.id 
        }
      }));

      setSchedulePreview(null);
      setShowScheduleMore(false);
      setAdditionalMinutes("90");
      setBlockName("");
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule block");
      console.error(err);
    }
  };

  if (showSummary) {
    return (
      <PostSessionSummaryModal
        isOpen={true}
        onClose={() => {
          setShowSummary(false);
          onUpdated();
          onClose();
        }}
        mode="manual"
        startTime={new Date().toISOString()}
        endTime={new Date().toISOString()}
        actualMinutes={0}
        initialAssignmentId={assignment.id}
      />
    );
  }

  return (
    <>
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-brand-surface border-brand-border rounded-[2.5rem] p-0 gap-0">
        <div className="sticky top-0 z-20 bg-brand-surface/80 backdrop-blur-xl border-b border-brand-border/40 p-8">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-serif font-black text-brand-text italic leading-tight">
                  Edit Assignment
                </DialogTitle>
                {assignment.courseName && (
                  <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                    {assignment.courseName}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-brand-surface-2/50 flex items-center justify-center text-brand-muted hover:text-brand-text transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </DialogHeader>
        </div>

        <div className="p-8 space-y-8">
          {error && (
            <div className="p-4 rounded-2xl bg-brand-rose/10 border border-brand-rose/20 text-brand-rose text-sm font-medium flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-brand-rose animate-pulse" />
              {error}
            </div>
          )}

          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted px-2">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Assignment Title"
                className="h-14 bg-white dark:bg-brand-surface border-brand-border/60 hover:border-brand-primary/40 focus:border-brand-primary rounded-2xl text-lg font-bold focus:ring-2 focus:ring-brand-primary/20 transition-colors"
              />
            </div>
            
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted px-2">Description / Notes</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Your original input or notes about this assignment..."
                className="bg-white dark:bg-brand-surface border-brand-border/60 hover:border-brand-primary/40 focus:border-brand-primary rounded-2xl text-sm min-h-[100px] resize-none focus:ring-2 focus:ring-brand-primary/20 transition-colors"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted px-2">Course</Label>
                <div className="relative">
                  <select
                    value={editCourseId}
                    onChange={(e) => setEditCourseId(e.target.value)}
                    className="w-full h-12 bg-white dark:bg-brand-surface border-brand-border/60 hover:border-brand-primary/40 focus:border-brand-primary rounded-xl font-bold px-10 appearance-none focus:ring-2 focus:ring-brand-primary/20 outline-none transition-colors"
                  >
                    <option value="">No Course</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </select>
                  <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" size={18} />
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted px-2">Category</Label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Reading, Homework"
                  className="h-12 bg-white dark:bg-brand-surface border-brand-border/60 hover:border-brand-primary/40 focus:border-brand-primary rounded-xl font-bold focus:ring-2 focus:ring-brand-primary/20 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted px-2">Due Date</Label>
                <Input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-12 bg-white dark:bg-brand-surface border-brand-border/60 hover:border-brand-primary/40 focus:border-brand-primary rounded-xl font-bold focus:ring-2 focus:ring-brand-primary/20 transition-colors"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted px-2">Effort (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  value={effortMinutes}
                  onChange={(e) => setEffortMinutes(e.target.value)}
                  className="h-12 bg-white dark:bg-brand-surface border-brand-border/60 hover:border-brand-primary/40 focus:border-brand-primary rounded-xl font-bold focus:ring-2 focus:ring-brand-primary/20 transition-colors"
                />
              </div>
            </div>

            {/* Grade Entry Section */}
            <div className="space-y-4 pt-4 border-t border-brand-border/40">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted px-2">Grade (Optional)</Label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Points earned"
                    value={pointsEarned}
                    onChange={(e) => setPointsEarned(e.target.value)}
                    className="h-12 bg-white dark:bg-brand-surface border-brand-border/60 hover:border-brand-primary/40 focus:border-brand-primary rounded-xl font-bold text-center focus:ring-2 focus:ring-brand-primary/20 transition-colors"
                  />
                </div>
                <span className="text-brand-muted font-bold text-xl">/</span>
                <div className="flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Points possible"
                    value={pointsPossible}
                    onChange={(e) => setPointsPossible(e.target.value)}
                    className="h-12 bg-white dark:bg-brand-surface border-brand-border/60 hover:border-brand-primary/40 focus:border-brand-primary rounded-xl font-bold text-center focus:ring-2 focus:ring-brand-primary/20 transition-colors"
                  />
                </div>
              </div>
              {pointsEarned && pointsPossible && parseFloat(pointsPossible) > 0 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <span className="text-sm font-bold text-brand-muted">Grade:</span>
                  <span className="text-2xl font-black text-brand-primary">
                    {((parseFloat(pointsEarned) / parseFloat(pointsPossible)) * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Focus Blocks Section */}
          <div className="space-y-4 border-t border-brand-border/20 pt-8">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-brand-text uppercase tracking-wider">Scheduled Focus Blocks</h3>
              <Badge variant="outline" className="bg-brand-primary/5 text-brand-primary border-brand-primary/20">
                {loadingFocusBlocks ? "..." : focusBlocks.length} Blocks
              </Badge>
            </div>

            {loadingFocusBlocks ? (
              <div className="py-8 flex flex-col items-center justify-center gap-3 bg-brand-surface-2/30 rounded-3xl border border-brand-border/20">
                <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-brand-muted font-medium">Finding your focus sessions...</p>
              </div>
            ) : focusBlocks.length === 0 ? (
              <div className="py-8 text-center bg-brand-surface-2/30 rounded-3xl border border-dashed border-brand-border/40">
                <p className="text-sm text-brand-muted font-medium italic">No focus blocks scheduled yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {focusBlocks.map((block) => {
                  const start = new Date(block.startAt);
                  const end = new Date(block.endAt);
                  const isBlockCompleted = !!block.metadata?.isCompleted;

                  return (
                    <div
                      key={block.id}
                      className={cn(
                        "group relative p-5 rounded-3xl border transition-all duration-300",
                        isBlockCompleted 
                          ? "bg-brand-mint/5 border-brand-mint/20 opacity-80" 
                          : "bg-white dark:bg-brand-surface border-brand-border/60 hover:border-brand-primary/40 hover:shadow-md"
                      )}
                      onMouseEnter={() => {
                        window.dispatchEvent(new CustomEvent("highlightFocusBlocks", {
                          detail: { eventIds: [block.id] }
                        }));
                      }}
                      onMouseLeave={() => {
                        window.dispatchEvent(new CustomEvent("highlightFocusBlocks", {
                          detail: { eventIds: focusBlocks.map(b => b.id) }
                        }));
                      }}
                    >
                      <div className="flex justify-between items-center gap-4">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className={cn(
                            "font-bold truncate transition-colors",
                            isBlockCompleted ? "text-brand-mint line-through" : "text-brand-text group-hover:text-brand-primary"
                          )}>
                            {block.title}
                          </div>
                          <div className="text-[11px] font-medium text-brand-muted">
                            {start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Tooltip content={isBlockCompleted ? "Unmark this block as done" : "Mark this block as complete"}>
                            <button
                              onClick={() => handleToggleBlockComplete(block.id)}
                              className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm hover:scale-110",
                                isBlockCompleted 
                                  ? "bg-brand-mint text-white" 
                                  : "bg-brand-surface text-brand-muted hover:text-brand-mint hover:bg-brand-mint/10"
                              )}
                            >
                              <Check size={18} className={cn(isBlockCompleted && "animate-in zoom-in-50")} />
                            </button>
                          </Tooltip>
                          
                          <Tooltip content="Reschedule this block to another time">
                            <button
                              onClick={() => handleRescheduleBlock(block.id)}
                              className="w-10 h-10 rounded-xl bg-white dark:bg-brand-surface flex items-center justify-center text-brand-amber hover:text-brand-amber hover:bg-brand-amber/10 transition-all shadow-sm hover:scale-110"
                            >
                              <GessoIcon type="bolt" size={14} />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Schedule More Time Button */}
            {!showScheduleMore && (
              <Button
                onClick={() => setShowScheduleMore(true)}
                variant="outline"
                className="w-full h-12 rounded-2xl border-2 border-dashed border-brand-primary/30 text-brand-primary hover:bg-brand-primary/5 hover:border-brand-primary/50 font-bold transition-all"
              >
                <Plus size={18} className="mr-2" />
                Add More Time
              </Button>
            )}

            {/* Schedule More Time Form */}
            {showScheduleMore && (
              <div className="space-y-4 p-6 rounded-3xl bg-white dark:bg-brand-surface border-2 border-brand-primary/40">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-brand-text flex items-center gap-2">
                    <Clock size={18} className="text-brand-primary" />
                    Schedule More Time
                  </h4>
                  <button
                    onClick={() => {
                      setShowScheduleMore(false);
                      setAdditionalMinutes("90");
                      setBlockName("");
                    }}
                    className="text-brand-muted hover:text-brand-text transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-bold text-brand-text">Block Name (Optional)</Label>
                  <Input
                    value={blockName}
                    onChange={(e) => setBlockName(e.target.value)}
                    placeholder={`e.g., "Draft outline", "Research sources"`}
                    className="h-12 bg-white dark:bg-brand-surface border-brand-border/60 hover:border-brand-primary/40 focus:border-brand-primary rounded-xl font-medium text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-brand-text">Duration</Label>
                  <div className="flex items-center gap-4">
                    <Input
                      type="number"
                      min={15}
                      step={15}
                      value={additionalMinutes}
                      onChange={(e) => setAdditionalMinutes(e.target.value)}
                      className="h-12 bg-white dark:bg-brand-surface border-brand-border/60 hover:border-brand-primary/40 focus:border-brand-primary rounded-xl font-bold text-center text-lg"
                      placeholder="90"
                    />
                    <span className="text-sm font-bold text-brand-text">minutes</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => handleScheduleMoreTime(true)}
                    disabled={schedulingMore}
                    className="flex-1 h-12 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl font-bold"
                  >
                    <Calendar size={16} className="mr-2" />
                    {schedulingMore ? "Scheduling..." : "Auto-Schedule"}
                  </Button>
                  <Button
                    onClick={() => handleScheduleMoreTime(false)}
                    disabled={schedulingMore}
                    variant="outline"
                    className="flex-1 h-12 rounded-xl font-bold border-brand-border/60"
                  >
                    Manual Schedule
                  </Button>
                </div>

                <p className="text-xs text-brand-text/60 italic">
                  New work blocks will be linked to this assignment
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 z-20 bg-brand-surface/80 backdrop-blur-xl border-t border-brand-border/40 p-8">
          <div className="w-full flex flex-col gap-4">
            <Button
              className="w-full h-14 bg-brand-mint hover:bg-brand-mint/90 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] transition-all"
              onClick={handleComplete}
              disabled={completing}
            >
              <CheckCircle2 size={20} className="mr-2" />
              {completing ? "Marking..." : "Mark as Fully Complete"}
            </Button>

            <div className="flex items-center justify-between gap-4">
              <Button
                variant="ghost"
                className={cn("h-12 px-6 rounded-2xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold", deleting && "opacity-60")}
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 size={18} className="mr-2" />
                Delete
              </Button>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={onClose} className="h-12 px-6 rounded-2xl font-bold">
                  Cancel
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={saving} 
                  className="h-12 px-8 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-2xl font-black uppercase tracking-widest shadow-md hover:scale-[1.05] transition-all"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Reschedule Confirmation Dialog */}
    {reschedulePreview && (
      <Dialog open={true} onOpenChange={() => setReschedulePreview(null)}>
        <DialogContent className="max-w-lg bg-brand-surface border-brand-border rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-serif font-black text-brand-text italic">
              Confirm Reschedule
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-brand-muted">Block</Label>
              <p className="font-bold text-brand-text">{reschedulePreview.blockTitle}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-brand-muted">Current Time</Label>
              <p className="text-brand-text/70 line-through">{reschedulePreview.currentTime}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-brand-muted">New Time</Label>
              <p className="font-bold text-brand-primary text-lg">{reschedulePreview.newTime}</p>
            </div>

            <div className="p-4 rounded-2xl bg-brand-primary/10 border border-brand-primary/20">
              <Label className="text-xs font-bold uppercase tracking-wider text-brand-primary mb-2 block">Why this time?</Label>
              <p className="text-sm text-brand-text">{reschedulePreview.reason}</p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-3">
            <Button
              onClick={confirmReschedule}
              className="w-full h-12 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl font-bold"
            >
              Confirm Reschedule
            </Button>
            <div className="flex gap-3">
              <Button
                onClick={() => setReschedulePreview(null)}
                variant="outline"
                className="flex-1 h-10 rounded-xl font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setReschedulePreview(null);
                  toast.info("Manual scheduling - navigate to calendar");
                  onClose();
                }}
                variant="outline"
                className="flex-1 h-10 rounded-xl font-medium"
              >
                Pick Manually
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}

    {/* Schedule More Time Confirmation Dialog */}
    {schedulePreview && (
      <Dialog open={true} onOpenChange={() => setSchedulePreview(null)}>
        <DialogContent className="max-w-lg bg-white dark:bg-brand-surface border-brand-border rounded-3xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-serif font-black text-brand-text italic">
              Confirm New Time Block
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Block Name</Label>
              <p className="font-bold text-brand-text text-lg">{schedulePreview.blockName}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Duration</Label>
              <p className="text-brand-text font-bold text-lg">{schedulePreview.duration} minutes</p>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Scheduled Time</Label>
              <p className="font-bold text-brand-primary text-xl">{schedulePreview.proposedTime}</p>
            </div>

            <div className="p-6 rounded-2xl bg-brand-primary/10 border-2 border-brand-primary/30">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-primary mb-3 block">Why this time?</Label>
              <p className="text-sm text-brand-text font-medium leading-relaxed">{schedulePreview.reason}</p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-3 pt-4">
            <Button
              onClick={confirmScheduleMore}
              className="w-full h-14 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-2xl font-bold text-base"
            >
              Confirm & Add Block
            </Button>
            <div className="flex gap-3 w-full">
              <Button
                onClick={() => setSchedulePreview(null)}
                variant="outline"
                className="flex-1 h-12 rounded-xl font-bold border-2"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setSchedulePreview(null);
                  toast.info("Go to Calendar view to place this block manually");
                }}
                variant="ghost"
                className="flex-1 h-12 rounded-xl font-bold text-brand-primary hover:text-brand-primary/90 hover:bg-brand-primary/10"
              >
                Pick Manually
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}

    {/* Reschedule Confirmation Dialog */}
    {reschedulePreview && (
      <Dialog open={true} onOpenChange={() => setReschedulePreview(null)}>
        <DialogContent className="max-w-lg bg-white dark:bg-brand-surface border-brand-border rounded-3xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-serif font-black text-brand-text italic">
              Confirm Reschedule
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Block</Label>
              <p className="font-bold text-brand-text text-lg">{reschedulePreview.blockTitle}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Current Time</Label>
              <p className="text-brand-text/60 line-through text-base font-medium">{reschedulePreview.currentTime}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">New Time</Label>
              <p className="font-bold text-brand-primary text-xl">{reschedulePreview.newTime}</p>
            </div>

            <div className="p-6 rounded-2xl bg-brand-primary/10 border-2 border-brand-primary/30">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-primary mb-3 block">Why this time?</Label>
              <p className="text-sm text-brand-text font-medium leading-relaxed">{reschedulePreview.reason}</p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-3 pt-4">
            <Button
              onClick={confirmReschedule}
              className="w-full h-14 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-2xl font-bold text-base"
            >
              Confirm Reschedule
            </Button>
            <div className="flex gap-3 w-full">
              <Button
                onClick={() => setReschedulePreview(null)}
                variant="outline"
                className="flex-1 h-12 rounded-xl font-bold border-2"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setReschedulePreview(null);
                  toast.info("Manual scheduling - navigate to calendar");
                  onClose();
                }}
                variant="ghost"
                className="flex-1 h-12 rounded-xl font-bold text-brand-primary hover:text-brand-primary/90 hover:bg-brand-primary/10"
              >
                Pick Manually
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
  </>
  );
}

