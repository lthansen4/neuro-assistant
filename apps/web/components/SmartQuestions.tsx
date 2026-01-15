"use client";

import { useState } from "react";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Lightbulb } from "lucide-react";

interface SmartQuestion {
  id: string;
  text: string;
  type: "text" | "number" | "select" | "boolean";
  options?: string[];
  reasoning: string;
}

interface SmartQuestionsProps {
  questions: SmartQuestion[];
  answers: Record<string, any>;
  onAnswersChange: (answers: Record<string, any>) => void;
}

export function SmartQuestions({ questions, answers, onAnswersChange }: SmartQuestionsProps) {
  const [showOtherInputs, setShowOtherInputs] = useState<Record<string, boolean>>({});

  if (!questions || questions.length === 0) return null;

  const handleAnswer = (questionId: string, value: any) => {
    // If "Other" is selected, show the text input
    if (value === "__other__") {
      setShowOtherInputs({ ...showOtherInputs, [questionId]: true });
      onAnswersChange({
        ...answers,
        [questionId]: { type: "other", value: "" },
      });
    } else {
      // Regular answer
      setShowOtherInputs({ ...showOtherInputs, [questionId]: false });
      onAnswersChange({
        ...answers,
        [questionId]: value,
      });
    }
  };

  const handleOtherText = (questionId: string, text: string) => {
    onAnswersChange({
      ...answers,
      [questionId]: { type: "other", value: text },
    });
  };

  const getCurrentValue = (questionId: string) => {
    const answer = answers[questionId];
    if (typeof answer === "object" && answer?.type === "other") {
      return "__other__";
    }
    return answer || "";
  };

  return (
    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-lg space-y-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <h3 className="text-base font-semibold text-blue-900 dark:text-blue-100">
          Quick Questions to Schedule Better
        </h3>
      </div>
      <p className="text-xs text-blue-800 dark:text-blue-200">
        Based on your calendar and upcoming work
      </p>

      <div className="space-y-4">
        {questions.map((q) => {
          const currentValue = getCurrentValue(q.id);
          const showOther = showOtherInputs[q.id] || currentValue === "__other__";

          return (
            <div key={q.id} className="space-y-2">
              <Label htmlFor={q.id} className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {q.text}
              </Label>

              {/* Always render as dropdown with options + "Other" */}
              <select
                id={q.id}
                value={currentValue}
                onChange={(e) => handleAnswer(q.id, e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select an option...</option>
                {q.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value="__other__">✏️ Other (please specify)</option>
              </select>

              {/* Show text input when "Other" is selected */}
              {showOther && (
                <div className="pl-4 border-l-2 border-blue-400 dark:border-blue-600">
                  <Input
                    type="text"
                    value={typeof answers[q.id] === "object" ? answers[q.id].value : ""}
                    onChange={(e) => handleOtherText(q.id, e.target.value)}
                    placeholder="Please explain..."
                    className="text-sm bg-white dark:bg-gray-900 mt-2"
                    autoFocus
                  />
                </div>
              )}

              <p className="text-xs text-blue-700 dark:text-blue-300 italic">
                💡 {q.reasoning}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">
        ℹ️ These questions are optional - skip them to use AI's default scheduling
      </p>
    </div>
  );
}




