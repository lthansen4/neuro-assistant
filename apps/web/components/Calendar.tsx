"use client";
import { useRef, useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { ChecklistViewerModal } from "./ChecklistViewerModal";
import { EventDetailsModal } from "./EventDetailsModal";
import { AssignmentEditModal, AssignmentEditData } from "./AssignmentEditModal";
import { cn } from "../lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

// Detect if mobile
const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

// New Cozy 2026 Category Colors (Tinted surfaces)
const CATEGORY_COLORS: Record<string, { bg: string, border: string, text: string }> = {
  Class: { bg: "rgba(47,107,255,0.10)", border: "rgba(47,107,255,0.20)", text: "#2F6BFF" },
  DeepWork: { bg: "rgba(27,156,110,0.12)", border: "rgba(27,156,110,0.20)", text: "#1B9C6E" },
  Reset: { bg: "rgba(240,138,93,0.14)", border: "rgba(240,138,93,0.20)", text: "#F08A5D" },
  DueDate: { bg: "rgba(255,77,141,0.12)", border: "rgba(255,77,141,0.20)", text: "#FF4D8D" },
  Exam: { bg: "rgba(255,59,48,0.12)", border: "rgba(255,59,48,0.20)", text: "#FF3B30" },
  Wall: { bg: "rgba(124,77,255,0.12)", border: "rgba(124,77,255,0.20)", text: "#7C4DFF" },
  Other: { bg: "rgba(92,126,165,0.10)", border: "rgba(92,126,165,0.20)", text: "#5C7EA5" },
};

function getEventColors(eventType?: string, title?: string): { backgroundColor: string; borderColor: string; textColor: string } {
  const cat = eventType || 'Other';
  let config = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;

  // Manual overrides for legacy types or title markers
  if (title?.includes('📌 DUE:') || title?.includes('DUE') || cat === 'DueDate') {
    config = CATEGORY_COLORS.DueDate;
  } else if (cat === 'Focus' || cat === 'Homework' || cat === 'Studying') {
    config = CATEGORY_COLORS.DeepWork;
  } else if (cat === 'Chill') {
    config = CATEGORY_COLORS.Reset;
  } else if (cat === 'OfficeHours') {
    config = CATEGORY_COLORS.Class;
  }

  return {
    backgroundColor: config.bg,
    borderColor: config.border,
    textColor: config.text,
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
  // Adaptive default: Day view on mobile, Week on desktop
  const [currentView, setCurrentView] = useState(() => isMobile() ? "timeGridDay" : "timeGridWeek");
  const [checklistModalOpen, setChecklistModalOpen] = useState(false);
  const [selectedChecklistEvent, setSelectedChecklistEvent] = useState<any>(null);
  const [eventDetailsModalOpen, setEventDetailsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentEditData | null>(null);
  const [highlightedEventIds, setHighlightedEventIds] = useState<Set<string>>(new Set());
  
  // Responsive view switching
  useEffect(() => {
    const handleResize = () => {
      const mobile = isMobile();
      const newView = mobile ? "timeGridDay" : "timeGridWeek";
      if (currentView !== newView) {
        setCurrentView(newView);
        calendarRef.current?.getApi().changeView(newView);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentView]);

  useEffect(() => {
    const handleHighlight = (e: Event) => {
      const detail = (e as CustomEvent).detail as { eventIds?: string[] } | undefined;
      const ids = detail?.eventIds || [];
      setHighlightedEventIds(new Set(ids.map(String)));
    };

    window.addEventListener("highlightFocusBlocks", handleHighlight as EventListener);
    return () => window.removeEventListener("highlightFocusBlocks", handleHighlight as EventListener);
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      calendarRef.current?.getApi().refetchEvents();
    };
    window.addEventListener('refreshCalendar', handleRefresh);
    return () => window.removeEventListener('refreshCalendar', handleRefresh);
  }, []);
  
  // Custom navigation handlers to keep state in sync
  const handleViewChange = (view: string) => {
    setCurrentView(view);
    const calendarApi = calendarRef.current?.getApi();
    if (calendarApi) {
      calendarApi.changeView(view);
    }
  };

  const handlePrev = () => calendarRef.current?.getApi().prev();
  const handleNext = () => calendarRef.current?.getApi().next();
  const handleToday = () => calendarRef.current?.getApi().today();

  const fetchEvents = async (info: any) => {
    if (!userId) return [];
    try {
      const res = await fetch(
        `${API_BASE}/api/calendar/events?start=${info.start.toISOString()}&end=${info.end.toISOString()}`,
        { headers: { "x-clerk-user-id": userId } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      if (data.ok && Array.isArray(data.events)) {
        return data.events.map((evt: any) => {
          const colors = getEventColors(evt.extendedProps?.eventType || evt.extendedProps?.type, evt.title);
          return {
            ...evt,
            backgroundColor: colors.backgroundColor,
            borderColor: colors.borderColor,
            textColor: colors.textColor,
            extendedProps: {
              ...evt.extendedProps,
              description: evt.description || null, // Pass description through
            }
          };
        });
      }
      return [];
    } catch (error) {
      console.error('[Calendar] Fetch error:', error);
      return [];
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Custom Cozy Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-2 md:px-4">
        <div className="flex items-center gap-2 bg-brand-surface-2 p-1 rounded-full cozy-border">
          <button onClick={handlePrev} className="p-2 hover:bg-brand-surface rounded-full transition-colors">←</button>
          <button onClick={handleToday} className="px-4 md:px-6 py-2 bg-brand-surface text-[11px] md:text-[12px] font-black uppercase tracking-widest rounded-full shadow-soft">today</button>
          <button onClick={handleNext} className="p-2 hover:bg-brand-surface rounded-full transition-colors">→</button>
        </div>

        <h2 className="text-2xl md:text-4xl font-serif font-black text-brand-text italic">
          {calendarRef.current?.getApi().view.title}
        </h2>

        <div className="flex items-center gap-2 bg-brand-surface-2 p-1 rounded-full cozy-border">
          <button 
            onClick={() => handleViewChange('dayGridMonth')}
            className={cn("px-4 md:px-6 py-2 text-[11px] md:text-[12px] font-black uppercase tracking-widest rounded-full transition-all", 
              currentView === 'dayGridMonth' ? "bg-brand-surface text-brand-text shadow-soft" : "text-brand-muted")}
          >
            month
          </button>
          <button 
            onClick={() => handleViewChange('timeGridWeek')}
            className={cn("px-4 md:px-6 py-2 text-[11px] md:text-[12px] font-black uppercase tracking-widest rounded-full transition-all", 
              currentView === 'timeGridWeek' ? "bg-brand-surface text-brand-text shadow-soft" : "text-brand-muted")}
          >
            week
          </button>
          <button 
            onClick={() => handleViewChange('timeGridDay')}
            className={cn("px-4 md:px-6 py-2 text-[11px] md:text-[12px] font-black uppercase tracking-widest rounded-full transition-all", 
              currentView === 'timeGridDay' ? "bg-brand-surface text-brand-text shadow-soft" : "text-brand-muted")}
          >
            day
          </button>
        </div>
      </div>

      <div className="bg-brand-surface rounded-[2.5rem] p-3 md:p-8 cozy-border shadow-soft min-h-[70vh] md:min-h-[75vh]">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={isMobile() ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={false} // Using our custom header
          timeZone="local"
          height="auto"
          contentHeight="auto"
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          nowIndicator={true}
          events={userId ? fetchEvents : events}
          dayHeaderFormat={{ weekday: 'short', month: 'numeric', day: 'numeric' }}
          slotLabelFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
          
          // Drag & Drop / Resizing Logic
          editable={true} 
          eventStartEditable={true}
          eventDurationEditable={true}
          
          eventDrop={(info) => onMove(info.event.id, info.event.start!, info.event.end!)}
          eventResize={(info) => onMove(info.event.id, info.event.start!, info.event.end!)}
          eventClassNames={(eventInfo) => {
            const id = String(eventInfo.event.id);
            return highlightedEventIds.has(id) ? ["focus-block-highlight"] : [];
          }}
          
          eventContent={(eventInfo) => {
            const isCompleted = eventInfo.event.extendedProps?.metadata?.isCompleted;
            const category = eventInfo.event.extendedProps?.eventType || 'Other';
            const timeText = eventInfo.timeText || "";
            const metadata = eventInfo.event.extendedProps?.metadata || {};
            // Robust check for transition buffer: title matches OR metadata flag is set
            const isTransitionBuffer = 
              metadata.transitionTax === true || 
              metadata.transitionTax === "true" || 
              eventInfo.event.title === "Transition Buffer";
            
            const courseName = eventInfo.event.extendedProps?.courseName;
            
            // Shorten titles for crowded views
            let displayTitle = eventInfo.event.title;
            if (currentView === 'dayGridMonth' || currentView === 'timeGridWeek') {
              // 1. If it's a transition buffer, don't label it at all
              if (isTransitionBuffer) {
                return (
                  <div className="h-full w-full opacity-30 bg-brand-surface-2/50 rounded-lg" />
                );
              }

              // 2. If it's a course-related event, prioritize Course Name (e.g. "HIST 305")
              if (courseName) {
                const lowerCat = (category || "").toLowerCase();
                const isTest = lowerCat.includes('test') || lowerCat.includes('exam') || lowerCat.includes('quiz') || lowerCat.includes('midterm') || lowerCat.includes('final');
                const isHomework = lowerCat.includes('homework') || lowerCat.includes('assignment');
                
                if (isTest) {
                  displayTitle = `${courseName} - Test`;
                } else if (isHomework) {
                  displayTitle = `${courseName} - Homework`;
                } else {
                  // Default to just the course name as requested
                  displayTitle = courseName;
                }
              } else {
                // 3. Shorten titles for non-course events
                displayTitle = displayTitle
                  .replace(/^Work on:\s*/i, "")
                  .replace(/^📌\s*DUE:\s*/i, "")
                  .replace(/\s*\(Session\s+\d+\)$/i, "");
              }
            }

            return (
              <div className={cn(
                "p-2 h-full flex flex-col gap-1 transition-opacity overflow-hidden",
                isCompleted && "opacity-50"
              )}>
                <div className="flex items-center justify-between gap-1">
                  {/* Hide category label for transition buffers in crowded views */}
                  {(!isTransitionBuffer || currentView === 'timeGridDay') && (
                    <span className="text-[9px] md:text-[10px] font-semibold uppercase tracking-wider opacity-70 truncate">
                      {category}
                    </span>
                  )}
                  {isCompleted && <span className="text-brand-mint text-[12px]">✓</span>}
                </div>
                {timeText && currentView !== 'dayGridMonth' && (
                  <div className="text-[9px] md:text-[10px] font-medium text-brand-muted truncate">{timeText}</div>
                )}
                <div className={cn(
                  "font-bold text-[12px] md:text-[13px] leading-tight break-words",
                  isCompleted && "line-through"
                )}>
                  {displayTitle}
                </div>
              </div>
            );
          }}
          
          eventClick={async (clickInfo) => {
            const event = clickInfo.event;
            const eventType = event.extendedProps?.eventType || 'Other';
            const linkedAssignmentId = event.extendedProps?.linkedAssignmentId || event.extendedProps?.assignmentId;
            
            // Comprehensive check for anything that should open the Assignment detail view
            const isDueDate = [
              'DueDate', 'Test', 'Quiz', 'Midterm', 'Final', 'Homework'
            ].includes(eventType) || event.title?.includes('📌 DUE:') || event.title?.includes('DUE');
            
            const isWorkBlock = eventType === 'Focus' || eventType === 'Studying';

            // If it's a Due Date or Work block linked to an assignment, show Assignment details
            if ((isDueDate || isWorkBlock) && linkedAssignmentId && userId) {
              try {
                const res = await fetch(`${API_BASE}/api/assignments/${linkedAssignmentId}/details`, {
                  headers: { "x-clerk-user-id": userId }
                });
                const data = await res.json();
                if (data.ok && data.assignment) {
                  setSelectedAssignment({
                    id: data.assignment.id,
                    title: data.assignment.title,
                    description: data.assignment.description,
                    dueDate: data.assignment.dueDate,
                    category: data.assignment.category,
                    effortEstimateMinutes: data.assignment.effortEstimateMinutes,
                    status: data.assignment.status,
                    courseName: data.assignment.courseName || null
                  });
                  setAssignmentModalOpen(true);
                  return;
                }
              } catch (err) {
                console.error('[Calendar] Failed to fetch assignment details:', err);
              }
            }

            // Fallback to standard event details
            setSelectedEvent({
              id: event.id,
              title: event.title,
              description: event.extendedProps?.description || null,
              start: event.start!,
              end: event.end!,
              eventType: eventType,
              isMovable: event.extendedProps?.isMovable ?? false,
              metadata: event.extendedProps?.metadata,
              linkedAssignmentId: linkedAssignmentId
            });
            setEventDetailsModalOpen(true);
          }}
        />
      </div>

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
            calendarRef.current?.getApi().refetchEvents();
          }}
        />
      )}

      {assignmentModalOpen && selectedAssignment && userId && (
        <AssignmentEditModal
          assignment={selectedAssignment}
          userId={userId}
          onClose={() => {
            setAssignmentModalOpen(false);
            setSelectedAssignment(null);
          }}
          onUpdated={() => {
            setAssignmentModalOpen(false);
            setSelectedAssignment(null);
            calendarRef.current?.getApi().refetchEvents();
          }}
          onDeleted={() => {
            setAssignmentModalOpen(false);
            setSelectedAssignment(null);
            calendarRef.current?.getApi().refetchEvents();
          }}
        />
      )}
    </div>
  );
}
