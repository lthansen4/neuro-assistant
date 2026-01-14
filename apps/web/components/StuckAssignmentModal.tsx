"use client";
import { useEffect, useState } from "react";
import { ChecklistQuestionsModal } from "./ChecklistQuestionsModal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

export function StuckAssignmentModal({ 
  assignmentId, 
  userId,
  eventId,
  onClose 
}: { 
  assignmentId: string;
  userId: string;
  eventId?: string;
  onClose: () => void;
}) {
  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showQuestions, setShowQuestions] = useState(false);
  
  useEffect(() => {
    fetchAssignment();
  }, [assignmentId, userId]);
  
  const fetchAssignment = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/dashboard/assignments?userId=${userId}`, {
        headers: {
          'x-user-id': userId,
        }
      });
      const data = await response.json();
      const found = data.assignments?.find((a: any) => a.id === assignmentId);
      
      if (found) {
        setAssignment(found);
      }
    } catch (error) {
      console.error('Failed to fetch assignment:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleBreakDown = () => {
    // Show the questions modal instead of directly creating a checklist
    setShowQuestions(true);
  };

  const handleQuestionsComplete = async (checklistId: string, items: any[]) => {
    console.log('[StuckAssignmentModal] Checklist created:', checklistId, items);
    
    // Mark intervention as shown
    try {
      await fetch(`${API_BASE}/api/adhd/intervention-shown/${assignmentId}`, {
        method: 'POST',
        headers: {
          'x-user-id': userId,
        }
      });
    } catch (error) {
      console.error('[StuckAssignmentModal] Failed to mark intervention:', error);
    }
    
    // Close modal and refresh calendar
    onClose();
    window.dispatchEvent(new Event('refreshCalendar'));
  };
  
  const handleDismiss = async () => {
    try {
      // Just mark intervention as shown
      await fetch(`${API_BASE}/api/adhd/intervention-shown/${assignmentId}`, {
        method: 'POST',
        headers: {
          'x-user-id': userId,
        }
      });
    } catch (error) {
      console.error('Failed to mark intervention shown:', error);
    }
    
    onClose();
  };
  
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md">
          <p className="text-gray-900 dark:text-white">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!assignment) {
    return null;
  }
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-6 rounded-t-lg">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            😰 This task is feeling stuck
          </h2>
          <p className="mt-2 text-white/90">
            You've moved this <strong>{assignment.deferralCount || 3} times</strong>. That usually means it feels too big or overwhelming.
          </p>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              📝 {assignment.title}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              If you keep putting this off, you're going to be in a world of hurt. How about we leave it right here on the calendar and I'll give you a checklist to walk you through it?
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              When you're ready to work on it, just click on the event and you'll see step-by-step guidance.
            </p>
          </div>
          
          {/* Encouragement */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <p className="text-blue-900 dark:text-blue-100 text-sm">
              💪 <strong>You've got this!</strong> Sometimes the hardest part is just starting. 
              The checklist will help you take it one small step at a time, and you'll get a celebration when you finish! 🎉
            </p>
          </div>
          
          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleBreakDown}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              ✨ Yes, break it down for me
            </button>
            <button
              onClick={handleDismiss}
              className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
            >
              No thanks, I've got this
            </button>
          </div>
        </div>
      </div>
      
      {/* Questions Modal */}
      {showQuestions && assignment && (
        <ChecklistQuestionsModal
          assignmentId={assignmentId}
          assignmentTitle={assignment.title}
          assignmentCategory={assignment.category || 'Homework'}
          userId={userId}
          onComplete={handleQuestionsComplete}
          onCancel={() => setShowQuestions(false)}
        />
      )}
    </div>
  );
}

