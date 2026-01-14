"use client";
import { useRef, useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { ChecklistViewerModal } from "./ChecklistViewerModal";
import { EventDetailsModal } from "./EventDetailsModal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

// Color scheme for different event types
const EVENT_COLORS = {
  // Classes and academic structure
  Class: { bg: '#3B82F6', border: '#2563EB', text: '#FFFFFF' }, // Blue - primary academic time
  OfficeHours: { bg: '#8B5CF6', border: '#7C3AED', text: '#FFFFFF' }, // Purple - instructor support
  
  // Assessments and due dates
  Test: { bg: '#EF4444', border: '#DC2626', text: '#FFFFFF' }, // Red - high stakes
  Midterm: { bg: '#DC2626', border: '#B91C1C', text: '#FFFFFF' }, // Darker red - major assessment
  Final: { bg: '#991B1B', border: '#7F1D1D', text: '#FFFFFF' }, // Darkest red - critical
  Quiz: { bg: '#F97316', border: '#EA580C', text: '#FFFFFF' }, // Orange - moderate stakes
  DueDate: { bg: '#EC4899', border: '#DB2777', text: '#FFFFFF' }, // Pink - submission deadline
  
  // Work/study time
  Focus: { bg: '#10B981', border: '#059669', text: '#FFFFFF' }, // Green - productive work time
  Studying: { bg: '#14B8A6', border: '#0D9488', text: '#FFFFFF' }, // Teal - test prep
  Homework: { bg: '#10B981', border: '#059669', text: '#FFFFFF' }, // Green - same as Focus
  
  // Break/wellness
  Chill: { bg: '#F59E0B', border: '#D97706', text: '#FFFFFF' }, // Amber - rest time
  
  // Generic/other
  Other: { bg: '#6B7280', border: '#4B5563', text: '#FFFFFF' }, // Gray - misc
};

function getEventColors(eventType?: string, title?: string): { backgroundColor: string; borderColor: string; textColor: string } {
  // Check title for special markers
  if (title?.includes('📌 DUE:') || title?.includes('DUE')) {
    return {
      backgroundColor: EVENT_COLORS.DueDate.bg,
      borderColor: EVENT_COLORS.DueDate.border,
      textColor: EVENT_COLORS.DueDate.text,
    };
  }
  
  // Map event type to colors
  const colors = EVENT_COLORS[eventType as keyof typeof EVENT_COLORS] || EVENT_COLORS.Other;
  return {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    textColor: colors.text,
  };
}

export function Calendar({ 
  events, 
  onMove,
  userId 
}: { 
  events: any[]; 
  onMove: (id:string, start:Date, end:Date)=>void;
  userId?: string;
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const [eventBeingMoved, setEventBeingMoved] = useState<any>(null);
  const [checklistModalOpen, setChecklistModalOpen] = useState(false);
  const [selectedChecklistEvent, setSelectedChecklistEvent] = useState<any>(null);
  const [eventDetailsModalOpen, setEventDetailsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    title: string;
    start: Date;
    end: Date;
    eventType: string;
    isMovable: boolean;
    metadata?: any;
    linkedAssignmentId?: string;
  } | null>(null);
  
  // Listen for refresh events from Quick Add
  useEffect(() => {
    const handleRefresh = () => {
      console.log('[Calendar Component] Refresh event received, refetching events...');
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        calendarApi.refetchEvents();
      }
    };
    
    window.addEventListener('refreshCalendar', handleRefresh);
    return () => window.removeEventListener('refreshCalendar', handleRefresh);
  }, []);
  
  
  // Dynamic event fetching - FullCalendar will call this function whenever the date range changes
  const fetchEvents = async (info: any) => {
    console.log('[Calendar Component] Fetching events for range:', info.start, 'to', info.end);
    
    if (!userId) {
      console.warn('[Calendar Component] No userId provided, cannot fetch events');
      return [];
    }
    
    try {
      const res = await fetch(
        `${API_BASE}/api/calendar/events?start=${info.start.toISOString()}&end=${info.end.toISOString()}`,
        {
          headers: {
            "x-clerk-user-id": userId,
          },
        }
      );
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch events");
      }
      
      const data = await res.json();
      if (data.ok && Array.isArray(data.events)) {
        // Convert ISO strings to Date objects and apply colors
        const formattedEvents = data.events.map((evt: any) => {
          const colors = getEventColors(evt.extendedProps?.eventType, evt.title);
          return {
            id: evt.id,
            title: evt.title || 'Untitled Event',
            start: new Date(evt.start),
            end: new Date(evt.end),
            backgroundColor: colors.backgroundColor,
            borderColor: colors.borderColor,
            textColor: colors.textColor,
            extendedProps: evt.extendedProps || {},
          };
        });
        console.log(`[Calendar Component] Fetched ${formattedEvents.length} events for range`);
        return formattedEvents;
      }
      return [];
    } catch (error: any) {
      console.error('[Calendar Component] Error fetching events:', error);
      return [];
    }
  };
  
  // Handle event drop (drag and drop)
  const handleEventDrop = async (info: any) => {
    const event = info.event;
    const oldStart = info.oldEvent.start;
    const oldEnd = info.oldEvent.end;
    const newStart = event.start;
    const newEnd = event.end;
    const timeDelta = newStart.getTime() - oldStart.getTime();
    
    console.log(`[Calendar] Event dropped: ${event.title}`);
    
    // Check if this event has a linked transition buffer
    const allEvents = info.view.calendar.getEvents();
    const linkedBuffer = allEvents.find((evt: any) => {
      const metadata = evt.extendedProps?.metadata;
      return metadata?.transitionTax && metadata?.linkedToEvent === event.id;
    });
    
    // Store old buffer position for potential revert
    let oldBufferStart: Date | null = null;
    let oldBufferEnd: Date | null = null;
    let newBufferStart: Date | null = null;
    let newBufferEnd: Date | null = null;
    
    if (linkedBuffer) {
      console.log(`[Calendar] Found linked buffer, moving it with parent event`);
      
      // Store old positions
      oldBufferStart = linkedBuffer.start;
      oldBufferEnd = linkedBuffer.end;
      
      // Calculate new buffer positions
      newBufferStart = new Date(linkedBuffer.start.getTime() + timeDelta);
      newBufferEnd = new Date(linkedBuffer.end.getTime() + timeDelta);
    }
    
    // Try to move the main event - if it fails, revert everything
    try {
      await onMove(event.id, newStart, newEnd);
      
      // If main event succeeded and there's a buffer, move it too
      if (linkedBuffer && newBufferStart && newBufferEnd) {
        try {
          await onMove(linkedBuffer.id, newBufferStart, newBufferEnd);
          
          // Update buffer's visual position to match the main event's move
          linkedBuffer.setDates(newBufferStart, newBufferEnd);
          
          console.log(`[Calendar] ✅ Both events moved successfully`);
        } catch (bufferError: any) {
          console.error(`[Calendar] ❌ Buffer move failed, reverting both events:`, bufferError);
          
          // Revert both events to original positions
          event.setDates(oldStart, oldEnd);
          linkedBuffer.setDates(oldBufferStart!, oldBufferEnd!);
        }
      }
    } catch (mainError: any) {
      console.error(`[Calendar] ❌ Main event move failed, reverting:`, mainError);
      
      // Revert main event
      event.setDates(oldStart, oldEnd);
      
      // If buffer was visually moved, revert it too
      if (linkedBuffer && oldBufferStart && oldBufferEnd) {
        linkedBuffer.setDates(oldBufferStart, oldBufferEnd);
      }
    }
  };
  
  // Handle event resize
  const handleEventResize = async (info: any) => {
    const event = info.event;
    
    console.log(`[Calendar] Event resized: ${event.title}`);
    
    // Call parent onMove handler - it will handle validation
    onMove(event.id, event.start!, event.end!);
  };
  
  return (
    <>
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        timeZone="local" // Critical: Display times in user's local timezone
        slotMinTime="06:00:00" // Start calendar at 6 AM
        slotMaxTime="24:00:00" // End at midnight
        nowIndicator={true} // Show current time line
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'timeGridWeek,timeGridDay'
        }}
        events={userId ? fetchEvents : events}
        editable={true}
        eventStartEditable={true}
        eventDurationEditable={true}
        eventAllow={(dropInfo, draggedEvent) => Boolean((draggedEvent as any).extendedProps?.isMovable)}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        eventDidMount={(arg) => {
          console.log('[Calendar Component] Event mounted:', arg.event.title, arg.event.start, arg.event.end);
          if ((arg.event as any).extendedProps?.type === 'OfficeHours') {
            (arg.el as HTMLElement).style.borderStyle = 'dotted';
          }
        }}
        eventContent={(eventInfo) => {
          // Add visual indicator for deferred/stuck events
          const deferralCount = eventInfo.event.extendedProps?.deferralCount || 0;
          const isStuck = eventInfo.event.extendedProps?.isStuck || false;
          const hasChecklist = eventInfo.event.extendedProps?.hasChecklist || false;
          const metadata = eventInfo.event.extendedProps?.metadata || {};
          const isCompleted = metadata.isCompleted || false;
          
          // #region agent log
          if (isCompleted) {
            fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Calendar.tsx:eventContent:COMPLETED_EVENT',message:'Rendering completed event',data:{title:eventInfo.event.title,isCompleted,metadata,hasCheckmark:true},timestamp:Date.now(),sessionId:'debug-session',runId:'visual-check',hypothesisId:'L'})}).catch(()=>{});
          }
          // #endregion
          
          // Debug logging
          if (hasChecklist) {
            console.log(`[Calendar] Event with checklist:`, eventInfo.event.title, eventInfo.event.extendedProps);
          }
          
          return (
            <div className="fc-event-main-frame" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px', 
              padding: '2px 4px',
              opacity: isCompleted ? 0.7 : 1,
              textDecoration: isCompleted ? 'line-through' : 'none'
            }}>
              {isCompleted && (
                <span 
                  style={{
                    fontSize: '20px',
                    color: '#10B981',
                    fontWeight: 'bold',
                    marginRight: '4px',
                    textShadow: '0 0 2px rgba(16, 185, 129, 0.5)'
                  }}
                  title="Completed! 🎉"
                >
                  ✓
                </span>
              )}
              <div className="fc-event-title-container" style={{ flex: 1 }}>
                <div className="fc-event-title">{eventInfo.event.title}</div>
              </div>
              {hasChecklist && !isCompleted && (
                <span 
                  style={{
                    fontSize: '16px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                  title="Click to open checklist"
                >
                  📋
                </span>
              )}
              {deferralCount > 0 && !isCompleted && (
                <span 
                  className="deferral-badge"
                  style={{
                    fontSize: '10px',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    backgroundColor: isStuck ? '#DC2626' : '#F59E0B',
                    color: 'white',
                    fontWeight: 'bold'
                  }}
                  title={`Postponed ${deferralCount} times${isStuck ? ' - STUCK!' : ''}`}
                >
                  {isStuck ? '🧱' : '↻'} {deferralCount}
                </span>
              )}
            </div>
          );
        }}
        eventClick={(clickInfo) => {
          const event = clickInfo.event;
          const hasChecklist = event.extendedProps?.hasChecklist;
          const linkedAssignmentId = event.extendedProps?.linkedAssignmentId;
          
          // Priority 1: Open checklist if exists (preserve existing behavior)
          if (hasChecklist && linkedAssignmentId) {
            setSelectedChecklistEvent({
              assignmentId: linkedAssignmentId,
              eventId: event.id,
              title: event.title,
              dueDate: event.extendedProps?.metadata?.dueDate,
              isMovable: event.extendedProps?.isMovable ?? false,
            });
            setChecklistModalOpen(true);
            return;
          }
          
          // Priority 2: Open event details modal for all other events
          setSelectedEvent({
            id: event.id,
            title: event.title,
            start: event.start!,
            end: event.end!,
            eventType: event.extendedProps?.eventType || event.extendedProps?.type || 'Other',
            isMovable: event.extendedProps?.isMovable ?? false,
            metadata: event.extendedProps?.metadata,
            linkedAssignmentId: event.extendedProps?.linkedAssignmentId // FIX: Include linkedAssignmentId
          });
          setEventDetailsModalOpen(true);
        }}
        // Ensure calendar shows events from today onwards
        initialDate={new Date()}
        // Remove validRange restriction to show all events
        // validRange was preventing events from displaying if they were slightly outside the range
      />
      
      {/* Checklist Viewer Modal */}
      {checklistModalOpen && selectedChecklistEvent && userId && (
        <ChecklistViewerModal
          assignmentId={selectedChecklistEvent.assignmentId}
          eventId={selectedChecklistEvent.eventId}
          isMovable={selectedChecklistEvent.isMovable}
          userId={userId}
          assignmentTitle={selectedChecklistEvent.title}
          dueDate={selectedChecklistEvent.dueDate}
          onClose={() => {
            setChecklistModalOpen(false);
            setSelectedChecklistEvent(null);
          }}
          onDeleted={() => {
            setChecklistModalOpen(false);
            setSelectedChecklistEvent(null);
            // Force calendar refresh
            if (calendarRef.current) {
              const calendarApi = calendarRef.current.getApi();
              calendarApi.refetchEvents();
            }
          }}
        />
      )}
      
      {/* Event Details Modal */}
      {eventDetailsModalOpen && selectedEvent && userId && (
        <EventDetailsModal
          event={selectedEvent}
          userId={userId}
          onClose={() => {
            setEventDetailsModalOpen(false);
            setSelectedEvent(null);
          }}
          onDeleted={() => {
            setEventDetailsModalOpen(false);
            setSelectedEvent(null);
            // Force calendar refresh
            if (calendarRef.current) {
              const calendarApi = calendarRef.current.getApi();
              calendarApi.refetchEvents();
            }
          }}
        />
      )}
    </>
  );
}
