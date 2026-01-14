"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle, Calendar, Clock } from "lucide-react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

interface AssignmentSuccessBannerProps {
  // We'll listen for custom events, no props needed
}

export function AssignmentSuccessBanner() {
  const [visible, setVisible] = useState(false);
  const [details, setDetails] = useState<any>(null);

  useEffect(() => {
    const handleAssignmentCreated = (e: CustomEvent) => {
      const { assignment, focusBlocks, parseResult } = e.detail;
      setDetails({ assignment, focusBlocks, parseResult });
      setVisible(true);

      // Auto-hide after 10 seconds
      setTimeout(() => {
        setVisible(false);
      }, 10000);
    };

    window.addEventListener('assignmentCreated', handleAssignmentCreated as EventListener);
    return () => window.removeEventListener('assignmentCreated', handleAssignmentCreated as EventListener);
  }, []);

  if (!visible || !details) return null;

  const { assignment, focusBlocks, parseResult } = details;
  const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
  const isChunked = parseResult?.chunked || focusBlocks.length > 1;

  return (
    <div className="fixed top-20 right-4 z-50 w-full max-w-md animate-slide-in-right">
      <Card className="p-4 shadow-2xl border-2 border-green-500 bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-6 w-6 text-green-500" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                ✅ Assignment Created!
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {assignment.title}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => setVisible(false)}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Details */}
        <div className="space-y-2 text-sm">
          {/* Due Date */}
          {dueDate && (
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              <Calendar className="h-4 w-4 text-blue-400" />
              <span>
                <strong>Due:</strong> {dueDate.toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          )}

          {/* Focus Blocks */}
          {focusBlocks && focusBlocks.length > 0 && (
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-700">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-green-600 dark:text-green-400" />
                <strong className="text-green-900 dark:text-green-100">
                  {isChunked ? `${focusBlocks.length} Focus Sessions Scheduled:` : 'Focus Block Scheduled:'}
                </strong>
              </div>
              <div className="space-y-1">
                {focusBlocks.slice(0, 3).map((block: any, idx: number) => {
                  const start = new Date(block.start_at || block.startAt);
                  const end = new Date(block.end_at || block.endAt);
                  const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
                  
                  return (
                    <div key={idx} className="text-xs text-gray-700 dark:text-gray-300">
                      📅 {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} 
                      {' '}at {start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      {' '}({duration} min)
                      {block.metadata?.chunkIndex !== undefined && (
                        <span className="ml-2 text-green-700 dark:text-green-300 font-medium">
                          Session {block.metadata.chunkIndex + 1}/{block.metadata.totalChunks}
                        </span>
                      )}
                    </div>
                  );
                })}
                {focusBlocks.length > 3 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                    + {focusBlocks.length - 3} more sessions
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chunking Info */}
          {isChunked && (
            <div className="text-xs text-gray-600 dark:text-gray-400 italic">
              💡 Large task detected - split into multiple work sessions with 8-hour rest between
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

