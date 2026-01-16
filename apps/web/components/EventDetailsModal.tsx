"use client";
import { useState } from "react";
import confetti from 'canvas-confetti';
import { toast } from "./ui/Toast";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

interface EventDetailsModalProps {
  event: {
    id: string;
    title: string;
    start: Date;
    end: Date;
    eventType: string;
    isMovable: boolean;
    metadata?: any;
    linkedAssignmentId?: string;
  };
  userId: string;
  onClose: () => void;
  onDeleted: () => void;
}

export function EventDetailsModal({
  event,
  userId,
  onClose,
  onDeleted,
}: EventDetailsModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Edit state
  const [editedTitle, setEditedTitle] = useState(event.title);
  const [editedDate, setEditedDate] = useState(formatDateForInput(event.start));
  const [editedStartTime, setEditedStartTime] = useState(formatTimeForInput(event.start));
  const [editedEndTime, setEditedEndTime] = useState(formatTimeForInput(event.end));

  // Helper functions
  function formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatTimeForInput(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function combineDateTime(dateStr: string, timeStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  }

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  const formatDuration = (start: Date, end: Date) => {
    const durationMs = end.getTime() - start.getTime();
    const minutes = Math.round(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0 && remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${minutes}m`;
    }
  };

  // Calculate duration for edited times
  const calculateEditedDuration = () => {
    try {
      const start = combineDateTime(editedDate, editedStartTime);
      const end = combineDateTime(editedDate, editedEndTime);
      return formatDuration(start, end);
    } catch {
      return '--';
    }
  };

  const validateEdits = (): string | null => {
    if (!editedTitle.trim()) {
      return 'Title cannot be empty';
    }

    try {
      const start = combineDateTime(editedDate, editedStartTime);
      const end = combineDateTime(editedDate, editedEndTime);

      if (end <= start) {
        return 'End time must be after start time';
      }

      return null; // Valid
    } catch {
      return 'Invalid date or time format';
    }
  };

  const handleSave = async () => {
    setError(null);
    
    const validationError = validateEdits();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      const startAt = combineDateTime(editedDate, editedStartTime);
      const endAt = combineDateTime(editedDate, editedEndTime);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EventDetailsModal.tsx:131',message:'Frontend sending PUT request',data:{eventId:event.id,newTitle:editedTitle,eventMetadata:event.metadata,linkedAssignmentId:event.metadata?.linkedAssignmentId},timestamp:Date.now(),sessionId:'debug-session',runId:'title-sync',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      const response = await fetch(`${API_BASE}/api/calendar/events/${event.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-clerk-user-id': userId,
        },
        body: JSON.stringify({
          title: editedTitle,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update event');
      }

      const responseData = await response.json().catch(() => ({}));
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EventDetailsModal.tsx:151',message:'PUT request successful',data:{responseData},timestamp:Date.now(),sessionId:'debug-session',runId:'title-sync',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      // Success - close modal and trigger refresh
      onDeleted(); // Using onDeleted callback to refresh (same effect)
    } catch (error: any) {
      console.error('Failed to update event:', error);
      setError(error.message);
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
    // Reset to original values
    setEditedTitle(event.title);
    setEditedDate(formatDateForInput(event.start));
    setEditedStartTime(formatTimeForInput(event.start));
    setEditedEndTime(formatTimeForInput(event.end));
  };

  const handleMarkComplete = async () => {
    // FIX: linkedAssignmentId is now passed as top-level prop from Calendar
    const linkedAssignmentId = event.linkedAssignmentId || event.metadata?.linkedAssignmentId || (event as any).linkedAssignmentId;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EventDetailsModal.tsx:handleMarkComplete:START',message:'Mark complete clicked',data:{eventId:event.id,eventTitle:event.title,linkedAssignmentId_prop:event.linkedAssignmentId,linkedAssignmentId_metadata:event.metadata?.linkedAssignmentId,linkedAssignmentId_any:(event as any).linkedAssignmentId,linkedAssignmentId_final:linkedAssignmentId},timestamp:Date.now(),sessionId:'debug-session',runId:'complete-fix-v2',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    let confirmMessage = `Mark "${event.title}" as complete?`;
    if (linkedAssignmentId) {
      confirmMessage += '\n\nThis will keep the event on your calendar with a checkmark for that dopamine hit! ✓';
    }
    
    if (!confirm(confirmMessage)) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EventDetailsModal.tsx:handleMarkComplete:CANCELLED',message:'User cancelled confirmation',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'complete-fix',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      return;
    }

    setCompleting(true);

    try {
      // If linked to assignment, use the checklist complete endpoint
      if (linkedAssignmentId) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EventDetailsModal.tsx:handleMarkComplete:API_CALL',message:'Calling complete API',data:{linkedAssignmentId,endpoint:`${API_BASE}/api/adhd/complete/${linkedAssignmentId}`},timestamp:Date.now(),sessionId:'debug-session',runId:'complete-fix',hypothesisId:'G'})}).catch(()=>{});
        // #endregion
        
        const response = await fetch(`${API_BASE}/api/adhd/complete/${linkedAssignmentId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-clerk-user-id': userId,
          },
        });

        const responseData = await response.json().catch(() => ({}));
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EventDetailsModal.tsx:handleMarkComplete:API_RESPONSE',message:'Complete API response',data:{ok:response.ok,status:response.status,responseData},timestamp:Date.now(),sessionId:'debug-session',runId:'complete-fix',hypothesisId:'G'})}).catch(()=>{});
        // #endregion

        if (!response.ok) {
          throw new Error(responseData.error || 'Failed to mark assignment complete');
        }
        
        // 🎉 Trigger confetti for completed assignment!
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EventDetailsModal.tsx:handleMarkComplete:NO_ASSIGNMENT',message:'No assignment link - deleting event',data:{eventId:event.id},timestamp:Date.now(),sessionId:'debug-session',runId:'complete-fix',hypothesisId:'I'})}).catch(()=>{});
        // #endregion
        
        // No assignment link - just delete the event (for non-work events like Chill)
        const response = await fetch(`${API_BASE}/api/calendar/events/${event.id}`, {
          method: 'DELETE',
          headers: {
            'x-clerk-user-id': userId,
          },
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to complete event');
        }
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EventDetailsModal.tsx:handleMarkComplete:SUCCESS',message:'About to refresh calendar',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'complete-fix',hypothesisId:'H'})}).catch(()=>{});
      // #endregion

      // Success - refresh calendar
      onDeleted();
    } catch (error: any) {
      console.error('Failed to mark complete:', error);
      alert(`Failed to mark complete: ${error.message}`);
      setCompleting(false);
    }
  };

  const handleDelete = async () => {
    // Check if this event has a linked transition buffer
    const hasLinkedBuffer = event.metadata?.linkedToEvent;
    
    let confirmMessage = `Are you sure you want to delete "${event.title}"?`;
    
    if (event.title === "Transition Buffer") {
      confirmMessage = `Delete this transition buffer?\n\nNote: The linked event will remain.`;
    } else if (hasLinkedBuffer) {
      confirmMessage = `Delete "${event.title}"?\n\nNote: This will also delete its linked Transition Buffer.`;
    }
    
    if (!confirm(confirmMessage)) {
      return;
    }

    setDeleting(true);
    
    // Optimistic: close immediately
    onClose();
    toast.loading("Deleting event...");

    try {
      const response = await fetch(`${API_BASE}/api/calendar/events/${event.id}`, {
        method: 'DELETE',
        headers: {
          'x-clerk-user-id': userId,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete event');
      }

      const data = await response.json().catch(() => ({}));
      if ((event.metadata as any)?.linkedAssignmentId && data?.deletedAssignment === false) {
        toast.info("Removed from calendar. Assignment kept (has other events).");
      } else {
        toast.success("Event deleted ✓");
      }

      // Success - call onDeleted to refresh calendar
      onDeleted();
    } catch (error: any) {
      console.error('Failed to delete event:', error);
      toast.error(`Failed to delete: ${error.message}`);
      setDeleting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            {!isEditing ? (
              <>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                  {event.title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {event.eventType}
                </p>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="w-full text-xl font-semibold text-gray-900 dark:text-white mb-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                  placeholder="Event title"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {event.eventType}
                </p>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-800 dark:text-red-200">
              ⚠️ {error}
            </p>
          </div>
        )}

        {/* Event Details */}
        <div className="space-y-3 mb-6">
          {!isEditing ? (
            <>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Start Time</p>
                <p className="text-base text-gray-900 dark:text-white">
                  {formatDateTime(event.start)}
                </p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">End Time</p>
                <p className="text-base text-gray-900 dark:text-white">
                  {formatDateTime(event.end)}
                </p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Duration</p>
                <p className="text-base text-gray-900 dark:text-white">
                  {formatDuration(event.start, event.end)}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={editedDate}
                  onChange={(e) => setEditedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={editedStartTime}
                  onChange={(e) => setEditedStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={editedEndTime}
                  onChange={(e) => setEditedEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Duration</p>
                <p className="text-base text-gray-900 dark:text-white">
                  {calculateEditedDuration()}
                </p>
              </div>
            </>
          )}

          {!event.isMovable && !isEditing && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                ℹ️ This event cannot be edited or deleted (template-based or due date marker)
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {!isEditing ? (
            <>
              {/* Mark Complete Button (only for work events) */}
              {event.isMovable && !event.title.includes('Transition Buffer') && (
                <button
                  onClick={handleMarkComplete}
                  disabled={completing}
                  className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-bold text-lg transition-colors"
                >
                  {completing ? 'Completing...' : '✓ Mark Complete'}
                </button>
              )}
              
              {/* Action Buttons Row */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                >
                  Close
                </button>
                
                {event.isMovable && (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors"
                    >
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
