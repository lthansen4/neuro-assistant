"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Slider } from "./ui/slider";
import {
  BookOpen,
  ClipboardList,
  Flame,
  Search,
  CheckCircle2,
  Plus,
  Trash2,
  Clock,
  Check,
  HelpCircle,
  CalendarDays,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { cn } from "../lib/utils";
import { 
  fetchOverlappingAssignments, 
  searchAssignments, 
  updateAssignment,
  scheduleProfessorReminder,
  scheduleRemainingWork,
  fetchAssignmentDetails
} from "../lib/api";
import { useUser } from "@clerk/nextjs";
import { Progress } from "./ui/progress";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";

interface AssignmentUpdate {
  id: string;
  title: string;
  category: string;
  courseName?: string;
  totalPages?: number;
  pagesCompleted?: number;
  totalProblems?: number;
  problemsCompleted?: number;
  completionPercentage: number;
  notes: string;
  isCompleted?: boolean;
  professorQuestions: string[];
  questionsTarget: "Class" | "OfficeHours";
  rescheduleMode: "none" | "auto" | "manual";
  remainingMinutes: number;
}

interface PostSessionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  startTime: string; // ISO string
  endTime: string; // ISO string
  actualMinutes: number;
  initialAssignmentId?: string | null; // Added initialAssignmentId
}

export function PostSessionSummaryModal({
  isOpen,
  onClose,
  startTime,
  endTime,
  actualMinutes,
  initialAssignmentId, // Added initialAssignmentId
}: PostSessionSummaryModalProps) {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentUpdate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Load initial overlapping assignments
  useEffect(() => {
    if (isOpen && user?.id) {
      loadInitialAssignments();
    }
  }, [isOpen, user?.id, startTime, endTime]);

  const loadInitialAssignments = async () => {
    try {
      setLoading(true);
      const data = await fetchOverlappingAssignments(user!.id, startTime, endTime);
      let initialList = data.ok ? data.assignments : [];

      // If we have an initialAssignmentId, make sure it's in the list
      if (initialAssignmentId && !initialList.find((a: any) => a.id === initialAssignmentId)) {
        try {
          const detailData = await fetchAssignmentDetails(user!.id, initialAssignmentId);
          if (detailData.ok && detailData.assignment) {
            initialList = [detailData.assignment, ...initialList];
          }
        } catch (err) {
          console.error("Error fetching initial assignment details:", err);
        }
      }

      setAssignments(
        initialList.map((a: any) => ({
          ...a,
          notes: "",
          completionPercentage: a.completionPercentage || 0,
          professorQuestions: a.professorQuestions || [],
          questionsTarget: a.questionsTarget || "Class",
          rescheduleMode: "none",
          remainingMinutes: 60,
        }))
      );
    } catch (error) {
      console.error("Error loading assignments:", error);
      toast.error("Failed to load scheduled assignments");
    } finally {
      setLoading(false);
    }
  };

  // Search logic
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length > 2 && user?.id) {
        setSearching(true);
        try {
          const data = await searchAssignments(user.id, searchQuery);
          if (data.ok) {
            setSearchResults(
              data.assignments.filter(
                (sa: any) => !assignments.find((a) => a.id === sa.id)
              )
            );
          }
        } catch (error) {
          console.error("Search error:", error);
        } finally {
          setSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, user?.id, assignments]);

  const addAssignment = (a: any) => {
    setAssignments((prev) => [
      ...prev,
      { 
        ...a, 
        notes: "", 
        completionPercentage: a.completionPercentage || 0,
        professorQuestions: [],
        questionsTarget: "Class",
        rescheduleMode: "none",
        remainingMinutes: 60,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeAssignment = (id: string) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  };

  const updateField = (id: string, field: keyof AssignmentUpdate, value: any) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const updated = { ...a, [field]: value };
        
        if (field === "pagesCompleted" && updated.totalPages) {
          updated.completionPercentage = Math.round(
            (updated.pagesCompleted! / updated.totalPages) * 100
          );
        } else if (field === "problemsCompleted" && updated.totalProblems) {
          updated.completionPercentage = Math.round(
            (updated.problemsCompleted! / updated.totalProblems) * 100
          );
        }
        
        if (updated.completionPercentage >= 100) {
          updated.isCompleted = true;
          updated.completionPercentage = 100;
        } else {
          updated.isCompleted = false;
        }
        
        return updated;
      })
    );
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    let manualRescheduleUrl = null;

    try {
      const promises = assignments.map(async (a) => {
        // 1. Update basic progress
        await updateAssignment(user.id, a.id, {
          pagesCompleted: a.pagesCompleted,
          totalPages: a.totalPages,
          problemsCompleted: a.problemsCompleted,
          totalProblems: a.totalProblems,
          completionPercentage: a.completionPercentage,
          description: a.notes ? a.notes : undefined,
          status: a.completionPercentage === 100 ? "Completed" : undefined,
          professorQuestions: a.professorQuestions,
          questionsTarget: a.questionsTarget
        });

        // 2. Schedule professor reminder if questions exist
        if (a.professorQuestions.length > 0) {
          await scheduleProfessorReminder(user.id, a.id, a.professorQuestions, a.questionsTarget);
        }

        // 3. Reschedule remaining work if requested
        if (a.completionPercentage < 100) {
          if (a.rescheduleMode === "auto") {
            await scheduleRemainingWork(user.id, a.id, a.remainingMinutes);
          } else if (a.rescheduleMode === "manual" && !manualRescheduleUrl) {
            // Manual rescheduling will open the calendar page with the assignment highlighted
            // We only capture the first one if there are multiple, to avoid conflicting redirects
            manualRescheduleUrl = `/calendar?assignmentId=${a.id}&reschedule=true`;
          }
        }
      });

      await Promise.all(promises);
      toast.success("Progress and reminders saved!");
      
      if (manualRescheduleUrl) {
        window.location.href = manualRescheduleUrl;
      } else {
        onClose();
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save some updates");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-brand-surface border-brand-border rounded-[2rem] p-0 gap-0">
        <div className="sticky top-0 z-20 bg-brand-surface/80 backdrop-blur-xl border-b border-brand-border/40 p-8">
          <DialogHeader>
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 rounded-2xl bg-brand-mint/20 text-brand-mint flex items-center justify-center">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <DialogTitle className="text-2xl font-serif font-black text-brand-text italic">
                  Session Complete!
                </DialogTitle>
                <DialogDescription className="text-brand-muted font-medium">
                  You locked in for <span className="text-brand-primary font-bold">{actualMinutes}m</span>. What did you accomplish?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-8 space-y-8">
          {/* Assignment Search */}
          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted px-2">
              Add anything else you worked on
            </Label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" size={18} />
              <Input
                placeholder="Search by assignment or course name..."
                className="pl-12 h-14 bg-brand-surface-2/50 border-brand-border/40 rounded-2xl focus:ring-brand-primary"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-primary"></div>
                </div>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="bg-brand-surface-2 rounded-2xl border border-brand-border/40 overflow-hidden animate-in fade-in slide-in-from-top-2">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => addAssignment(result)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-brand-primary/5 transition-colors border-b border-brand-border/20 last:border-0"
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-bold text-brand-text">{result.title}</span>
                      <span className="text-[10px] text-brand-muted uppercase tracking-wider font-bold">
                        {result.courseName || "General"}
                      </span>
                    </div>
                    <Plus size={18} className="text-brand-primary" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted px-2">
              Update Progress
            </Label>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                <p className="text-sm text-brand-muted font-medium">Finding your scheduled tasks...</p>
              </div>
            ) : assignments.length === 0 ? (
              <div className="py-12 bg-brand-surface-2/30 rounded-3xl border border-dashed border-brand-border text-center">
                <Clock className="mx-auto mb-3 text-brand-muted opacity-20" size={32} />
                <p className="text-sm text-brand-muted font-medium">No scheduled tasks found for this window.</p>
                <p className="text-xs text-brand-muted/60 mt-1">Use the search bar above to add what you worked on.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {assignments.map((assignment) => (
                  <AssignmentUpdateCard
                    key={assignment.id}
                    assignment={assignment}
                    onUpdate={(field, value) => updateField(assignment.id, field, value)}
                    onRemove={() => removeAssignment(assignment.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 z-20 bg-brand-surface/80 backdrop-blur-xl border-t border-brand-border/40 p-8">
          <Button variant="ghost" onClick={onClose} className="rounded-2xl font-bold" disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || (assignments.length === 0 && !loading)}
            className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-2xl px-8 py-6 h-auto font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-all"
          >
            {saving ? "Saving..." : "Save Progress & Finish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentUpdateCard({
  assignment,
  onUpdate,
  onRemove,
}: {
  assignment: AssignmentUpdate;
  onUpdate: (field: keyof AssignmentUpdate, value: any) => void;
  onRemove: () => void;
}) {
  const [newQuestion, setNewQuestion] = useState("");
  const categoryStr = (assignment.category || "").toLowerCase();
  const isReading = categoryStr.includes("reading") || categoryStr.includes("book");
  const isHomework = categoryStr.includes("homework") || categoryStr.includes("assignment") || categoryStr.includes("prob");
  
  const icon = isReading ? <BookOpen size={18} /> : isHomework ? <ClipboardList size={18} /> : <Flame size={18} />;
  const colorClass = isReading 
    ? "text-category-deep-fg bg-category-deep-bg" 
    : isHomework 
      ? "text-brand-primary bg-brand-surface-2" 
      : "text-category-exam-fg bg-category-exam-bg";

  const addQuestion = () => {
    if (newQuestion.trim()) {
      onUpdate("professorQuestions", [...assignment.professorQuestions, newQuestion.trim()]);
      setNewQuestion("");
    }
  };

  return (
    <div className="group relative p-6 rounded-[2.5rem] bg-brand-surface border border-brand-border/40 shadow-soft animate-in fade-in slide-in-from-bottom-2">
      <button
        onClick={onRemove}
        className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-brand-surface border border-brand-border shadow-md flex items-center justify-center text-brand-muted hover:text-red-500 hover:border-red-200 transition-all opacity-0 group-hover:opacity-100 z-10"
      >
        <Trash2 size={14} />
      </button>

      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider", colorClass)}>
              {assignment.category || "Assignment"}
            </span>
            <h4 className="text-xl font-bold text-brand-text leading-tight">{assignment.title}</h4>
            {assignment.courseName && (
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">{assignment.courseName}</p>
            )}
          </div>
          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm", colorClass)}>
            {icon}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          {/* Progress Section */}
          <div className="space-y-6">
            <div className="space-y-4">
              {isReading ? (
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Pages Done</Label>
                    <Input
                      type="number"
                      value={assignment.pagesCompleted || ""}
                      onChange={(e) => onUpdate("pagesCompleted", parseInt(e.target.value) || 0)}
                      className="h-12 bg-brand-surface-2/50 border-brand-border/40 rounded-xl font-bold text-lg"
                    />
                  </div>
                  <div className="text-brand-muted font-bold self-end mb-3 text-xl">/</div>
                  <div className="flex-1 space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Total</Label>
                    <Input
                      type="number"
                      value={assignment.totalPages || ""}
                      onChange={(e) => onUpdate("totalPages", parseInt(e.target.value) || 0)}
                      className="h-12 bg-brand-surface-2/50 border-brand-border/40 rounded-xl font-bold text-lg"
                    />
                  </div>
                </div>
              ) : isHomework ? (
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Problems Done</Label>
                    <Input
                      type="number"
                      value={assignment.problemsCompleted || ""}
                      onChange={(e) => onUpdate("problemsCompleted", parseInt(e.target.value) || 0)}
                      className="h-12 bg-brand-surface-2/50 border-brand-border/40 rounded-xl font-bold text-lg"
                    />
                  </div>
                  <div className="text-brand-muted font-bold self-end mb-3 text-xl">/</div>
                  <div className="flex-1 space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Total</Label>
                    <Input
                      type="number"
                      value={assignment.totalProblems || ""}
                      onChange={(e) => onUpdate("totalProblems", parseInt(e.target.value) || 0)}
                      className="h-12 bg-brand-surface-2/50 border-brand-border/40 rounded-xl font-bold text-lg"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-brand-muted font-medium italic mt-2">Update your overall progress below.</p>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Overall Progress</Label>
                <span className="text-base font-black text-brand-primary">{assignment.completionPercentage}%</span>
              </div>
              <Slider
                value={[assignment.completionPercentage]}
                min={0}
                max={100}
                step={5}
                onValueChange={(val) => onUpdate("completionPercentage", val[0])}
                className="py-4"
              />
            </div>
          </div>

          {/* Schedule More / Notes Section */}
          <div className="space-y-6">
            {assignment.completionPercentage < 100 ? (
              <div className="p-5 rounded-3xl bg-brand-primary/5 border border-brand-primary/10 space-y-4">
                <div className="flex items-center gap-2">
                  <CalendarDays size={16} className="text-brand-primary" />
                  <span className="text-xs font-bold text-brand-text">Schedule remaining work?</span>
                </div>
                
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={assignment.rescheduleMode === "auto" ? "brand" : "outline"}
                      size="sm"
                      className={cn("rounded-xl text-[10px] font-black uppercase tracking-widest h-9 px-3")}
                      onClick={() => onUpdate("rescheduleMode", "auto")}
                    >
                      Auto
                    </Button>
                    <Button
                      variant={assignment.rescheduleMode === "manual" ? "brand" : "outline"}
                      size="sm"
                      className={cn("rounded-xl text-[10px] font-black uppercase tracking-widest h-9 px-3")}
                      onClick={() => onUpdate("rescheduleMode", "manual")}
                    >
                      Manual
                    </Button>
                    <Button
                      variant={assignment.rescheduleMode === "none" ? "brand" : "outline"}
                      size="sm"
                      className={cn(
                        "rounded-xl text-[10px] font-black uppercase tracking-widest h-9 px-3",
                        assignment.rescheduleMode === "none" && "bg-brand-rose text-white"
                      )}
                      onClick={() => onUpdate("rescheduleMode", "none")}
                    >
                      Skip
                    </Button>
                  </div>

                  {assignment.rescheduleMode !== "none" && (
                    <div className="animate-in fade-in slide-in-from-top-1">
                      <select
                        className="w-full h-10 bg-white border border-brand-border/40 rounded-xl text-[10px] font-bold px-3 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                        value={assignment.remainingMinutes}
                        onChange={(e) => onUpdate("remainingMinutes", parseInt(e.target.value))}
                      >
                        <option value={30}>Need 30m more</option>
                        <option value={60}>Need 1h more</option>
                        <option value={120}>Need 2h more</option>
                        <option value={180}>Need 3h more</option>
                      </select>
                      {assignment.rescheduleMode === "manual" && (
                        <p className="text-[9px] text-brand-muted mt-2 font-medium">
                          You'll be taken to the calendar to pick a spot after saving.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-3xl bg-brand-mint/10 border border-brand-mint/20 flex items-center gap-3">
                <Check size={20} className="text-brand-mint" />
                <span className="text-xs font-bold text-brand-mint uppercase tracking-widest">Marked as Fully Done</span>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Notes</Label>
              <Textarea
                placeholder="What did you accomplish?"
                className="bg-brand-surface-2/50 border-brand-border/40 rounded-2xl text-sm min-h-[80px]"
                value={assignment.notes}
                onChange={(e) => onUpdate("notes", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Professor Questions Section */}
        <div className="pt-6 border-t border-brand-border/20 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                <HelpCircle size={18} />
              </div>
              <h5 className="text-sm font-bold text-brand-text">Any questions for the professor?</h5>
            </div>
            
            {assignment.professorQuestions.length > 0 && (
              <div className="flex items-center gap-4 bg-brand-surface-2 px-4 py-2 rounded-2xl">
                <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Remind me during:</span>
                <RadioGroup 
                  value={assignment.questionsTarget} 
                  onValueChange={(val) => onUpdate("questionsTarget", val)}
                  className="flex items-center gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Class" id={`class-${assignment.id}`} className="text-brand-primary border-brand-border" />
                    <Label htmlFor={`class-${assignment.id}`} className="text-[10px] font-bold uppercase tracking-wider cursor-pointer">Next Class</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="OfficeHours" id={`oh-${assignment.id}`} className="text-brand-primary border-brand-border" />
                    <Label htmlFor={`oh-${assignment.id}`} className="text-[10px] font-bold uppercase tracking-wider cursor-pointer">Office Hours</Label>
                  </div>
                </RadioGroup>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Type a question to ask your professor..."
                className="h-12 bg-brand-surface-2/50 border-brand-border/40 rounded-xl"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addQuestion()}
              />
              <Button onClick={addQuestion} className="h-12 w-12 rounded-xl bg-brand-surface-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/5 transition-all">
                <Plus size={20} />
              </Button>
            </div>

            {assignment.professorQuestions.length > 0 && (
              <div className="space-y-2">
                {assignment.professorQuestions.map((q, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-brand-surface-2/30 rounded-2xl border border-brand-border/20 group/q">
                    <div className="flex items-center gap-3">
                      <MessageSquare size={14} className="text-brand-muted" />
                      <span className="text-sm font-medium text-brand-text">{q}</span>
                    </div>
                    <button 
                      onClick={() => onUpdate("professorQuestions", assignment.professorQuestions.filter((_, i) => i !== idx))}
                      className="text-brand-muted hover:text-red-500 opacity-0 group-hover/q:opacity-100 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 px-2 text-brand-muted">
                  <AlertCircle size={12} />
                  <p className="text-[10px] font-bold uppercase tracking-widest">Reminding you 10 mins before class!</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
