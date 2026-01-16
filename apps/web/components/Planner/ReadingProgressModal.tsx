// apps/web/components/Planner/ReadingProgressModal.tsx
"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { BookOpen, HelpCircle, Save, Loader2 } from "lucide-react";
import { toast } from "../ui/Toast";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

export function ReadingProgressModal({
  userId,
  assignmentId,
  title,
  currentPagesCompleted,
  totalPages,
  onClose,
  onSaved,
}: {
  userId: string;
  assignmentId: string;
  title: string;
  currentPagesCompleted: number | null;
  totalPages: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pagesRead, setPagesRead] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!pagesRead && !question) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      // 1. Fetch current assignment to get existing questions
      const getRes = await fetch(`${API_BASE}/api/assignments/${assignmentId}/details`, {
        headers: { "x-clerk-user-id": userId },
      });
      const getData = await getRes.json();
      if (!getRes.ok) throw new Error("Failed to load assignment details");

      const existingQuestions = getData.assignment?.readingQuestions || [];
      const newQuestions = [...existingQuestions];
      if (question.trim()) {
        newQuestions.push({
          text: question.trim(),
          createdAt: new Date().toISOString(),
        });
      }

      const updatedPagesCompleted = (currentPagesCompleted || 0) + (parseInt(pagesRead) || 0);

      // 2. Update assignment
      const updateRes = await fetch(`${API_BASE}/api/assignments/${assignmentId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
        body: JSON.stringify({
          pagesCompleted: updatedPagesCompleted,
          readingQuestions: newQuestions,
        }),
      });

      if (!updateRes.ok) throw new Error("Failed to save progress");

      toast.success("Progress saved! Great job keeping up with your reading. 📖");
      
      // 3. Logic for auto-schedule prompt if incomplete
      if (totalPages && updatedPagesCompleted < totalPages) {
        toast.info("You still have pages left. We'll make sure they stay on your schedule!");
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save progress");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[130]" onClick={onClose}>
      <div
        className="bg-white rounded-[2rem] shadow-xl max-w-md w-full mx-4 p-8 space-y-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-category-deep-bg flex items-center justify-center text-category-deep-fg mb-4">
            <BookOpen size={24} />
          </div>
          <h2 className="text-2xl font-black text-brand-text leading-tight">
            How was the reading?
          </h2>
          <p className="text-brand-muted font-medium italic">
            {title}
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-muted">
              How many pages did you read?
            </Label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0"
                className="pl-10 h-14 rounded-2xl border-brand-border/40 focus:ring-brand-primary"
                value={pagesRead}
                onChange={(e) => setPagesRead(e.target.value)}
              />
              <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" size={18} />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-muted">
              Any questions for class or your study group?
            </Label>
            <div className="relative">
              <textarea
                placeholder="What was confusing? What was interesting?"
                className="w-full min-h-[100px] p-4 pt-4 pl-10 rounded-2xl border border-brand-border/40 focus:ring-brand-primary text-sm font-medium resize-none outline-none"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <HelpCircle className="absolute left-4 top-4 text-brand-muted" size={18} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" className="flex-1 h-14 rounded-2xl" onClick={onClose}>
            Skip
          </Button>
          <Button className="flex-2 h-14 rounded-2xl bg-brand-primary hover:bg-brand-primary/90" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save className="mr-2" size={18} />}
            {saving ? "Saving..." : "Save Progress"}
          </Button>
        </div>
      </div>
    </div>
  );
}

