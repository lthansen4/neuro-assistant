"use client";
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

interface ChecklistItem {
  label: string;
  duration_minutes: number;
  completed: boolean;
}

interface Checklist {
  id: string;
  items: ChecklistItem[];
  createdAt: string;
  completedAt?: string;
}

export function ChecklistViewerModal({
  assignmentId,
  eventId,
  isMovable,
  userId,
  assignmentTitle,
  dueDate,
  onClose,
  onDeleted,
}: {
  assignmentId: string;
  eventId?: string;
  isMovable?: boolean;
  userId: string;
  assignmentTitle: string;
  dueDate?: string;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchChecklist();
  }, [assignmentId]);

  const fetchChecklist = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/adhd/checklist/${assignmentId}`, {
        headers: {
          'x-user-id': userId,
        }
      });

      if (!response.ok) {
        throw new Error('Checklist not found');
      }

      const data = await response.json();
      setChecklist(data);
    } catch (error) {
      console.error('Failed to fetch checklist:', error);
      alert('Failed to load checklist');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleToggleItem = async (itemIndex: number) => {
    if (!checklist) return;

    const newCompleted = !checklist.items[itemIndex].completed;

    try {
      const response = await fetch(`${API_BASE}/api/adhd/checklist/${checklist.id}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          itemIndex,
          completed: newCompleted,
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update item');
      }

      const data = await response.json();
      
      // Update local state
      setChecklist({
        ...checklist,
        items: data.items,
      });
    } catch (error) {
      console.error('Failed to toggle item:', error);
    }
  };

  const handleComplete = async () => {
    if (!checklist) return;

    setCompleting(true);

    try {
      const response = await fetch(`${API_BASE}/api/adhd/checklist/${checklist.id}/complete`, {
        method: 'POST',
        headers: {
          'x-user-id': userId,
        }
      });

      if (!response.ok) {
        throw new Error('Failed to complete checklist');
      }

      // Trigger confetti!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Show success message
      alert('🎉 Amazing work! Assignment completed!');

      // Wait a moment for confetti, then close
      setTimeout(() => {
        onClose();
        // Refresh calendar
        window.dispatchEvent(new Event('refreshCalendar'));
      }, 1500);
    } catch (error) {
      console.error('Failed to complete checklist:', error);
      alert('Failed to mark complete. Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  const handleDelete = async () => {
    if (!eventId) return;

    if (!confirm(`Delete this event and its checklist?\n\nNote: This will also delete any linked Transition Buffer.`)) {
      return;
    }

    setDeleting(true);

    try {
      const response = await fetch(`${API_BASE}/api/calendar/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          'x-clerk-user-id': userId,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete event');
      }

      // Success - call onDeleted to refresh calendar
      if (onDeleted) {
        onDeleted();
      } else {
        onClose();
      }
    } catch (error: any) {
      console.error('Failed to delete event:', error);
      alert(`Failed to delete event: ${error.message}`);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md">
          <p className="text-gray-900 dark:text-white">Loading checklist...</p>
        </div>
      </div>
    );
  }

  if (!checklist) {
    return null;
  }

  const allCompleted = checklist.items.every(item => item.completed);
  const completedCount = checklist.items.filter(item => item.completed).length;
  const progressPercent = (completedCount / checklist.items.length) * 100;
  const remainingMinutes = checklist.items
    .filter(item => !item.completed)
    .reduce((sum, item) => sum + item.duration_minutes, 0);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white p-6 rounded-t-lg">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                📋 Let's Do This!
              </h2>
              <p className="mt-1 text-white/90 font-semibold">
                {assignmentTitle}
              </p>
              {dueDate && (
                <p className="text-sm text-white/75 mt-1">
                  Due: {new Date(dueDate).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>{completedCount} of {checklist.items.length} completed</span>
            <span>{remainingMinutes} min remaining</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-green-500 to-blue-500 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Checklist Items */}
        <div className="p-6 space-y-3">
          {checklist.items.map((item, index) => (
            <div
              key={index}
              className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                item.completed
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}
            >
              <button
                onClick={() => handleToggleItem(index)}
                className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  item.completed
                    ? 'bg-green-500 border-green-500'
                    : 'border-gray-300 dark:border-gray-600 hover:border-green-500'
                }`}
              >
                {item.completed && (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              
              <span className={`flex-1 ${item.completed ? 'line-through text-gray-500 dark:text-gray-500' : 'text-gray-900 dark:text-white font-medium'}`}>
                {item.label}
              </span>
              
              <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
                {item.duration_minutes} min
              </span>
            </div>
          ))}
        </div>

        {/* Complete Button */}
        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={handleComplete}
            disabled={!allCompleted || completing}
            className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
              allCompleted && !completing
                ? 'bg-gradient-to-r from-green-500 to-blue-500 text-white hover:from-green-600 hover:to-blue-600 shadow-lg'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed'
            }`}
          >
            {completing ? '🎉 Completing...' : allCompleted ? '🎉 Mark Assignment Complete!' : '⬜ Complete all items to finish'}
          </button>

          {/* Delete Event Button - Only show if event is movable */}
          {eventId && isMovable && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full py-3 rounded-lg font-medium text-base transition-all bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white"
            >
              {deleting ? 'Deleting...' : 'Delete Event'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

