"use client";

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2, Sparkles } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

interface ChecklistQuestionsModalProps {
  assignmentId: string;
  assignmentTitle: string;
  assignmentCategory: string;
  userId: string;
  onComplete: (checklistId: string, items: any[]) => void;
  onCancel: () => void;
}

interface Question {
  id: string;
  text: string;
  reasoning?: string;
}

export function ChecklistQuestionsModal({
  assignmentId,
  assignmentTitle,
  assignmentCategory,
  userId,
  onComplete,
  onCancel
}: ChecklistQuestionsModalProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuestions = async () => {
    try {
      console.log('[ChecklistQuestions] Fetching smart questions...');
      
      const response = await fetch(`${API_BASE}/api/adhd/breakdown-questions/${assignmentId}`, {
        method: 'GET',
        headers: {
          'x-user-id': userId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch questions');
      }

      const data = await response.json();
      setQuestions(data.questions || []);
      
      console.log('[ChecklistQuestions] Got questions:', data.questions);
    } catch (err: any) {
      console.error('[ChecklistQuestions] Error fetching questions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch AI-generated questions on mount
  useEffect(() => {
    fetchQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, userId]);

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleSubmit = async () => {
    setGenerating(true);
    try {
      console.log('[ChecklistQuestions] Generating checklist with answers:', answers);
      
      // Send answers to backend to generate custom checklist
      const response = await fetch(`${API_BASE}/api/adhd/reset-stuck/${assignmentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          answers,
          generateWithAI: true,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checklist');
      }

      const data = await response.json();
      console.log('[ChecklistQuestions] Checklist created:', data);
      
      onComplete(data.checklist.id, data.checklist.items);
    } catch (err: any) {
      console.error('[ChecklistQuestions] Error creating checklist:', err);
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Allow submission even if not all questions are answered (optional questions)
  const hasAtLeastOneAnswer = questions.length > 0 && Object.values(answers).some(a => a && a.trim().length > 0);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4">
          <div className="flex flex-col items-center gap-4">
            <Sparkles className="h-12 w-12 text-blue-500 animate-pulse" />
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Analyzing your task...
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Generating smart questions to help you break this down
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error && questions.length === 0) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
              Oops! Something went wrong
            </h2>
            <p className="text-gray-700 dark:text-gray-300">
              {error}
            </p>
            <div className="flex gap-3 justify-end">
              <Button onClick={onCancel} variant="outline">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-2xl w-full my-8">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-blue-500" />
              Let's break this down together
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Answer these questions so I can create a checklist that actually works for <strong>{assignmentTitle}</strong>. 
              <span className="text-gray-500 dark:text-gray-500 italic"> (Answer at least one - skip any you don't know!)</span>
            </p>
          </div>

          {/* Questions */}
          <div className="space-y-6">
            {questions.map((question, idx) => (
              <div key={question.id} className="space-y-2">
                <Label htmlFor={question.id} className="text-base font-medium text-gray-900 dark:text-gray-100">
                  {idx + 1}. {question.text}
                </Label>
                
                {question.reasoning && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    {question.reasoning}
                  </p>
                )}

                <Input
                  id={question.id}
                  type="text"
                  value={answers[question.id] || ''}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                  placeholder="Type your answer here..."
                  className="w-full"
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button onClick={onCancel} variant="outline" disabled={generating}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={!hasAtLeastOneAnswer || generating}
              className="gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating your checklist...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Create My Checklist
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

