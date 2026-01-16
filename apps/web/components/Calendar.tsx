"use client";
import { useRef, useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { ChecklistViewerModal } from "./ChecklistViewerModal";
import { EventDetailsModal } from "./EventDetailsModal";
import { cn } from "../lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

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
  const [currentView, setCurrentView] = useState("timeGridWeek");
  const [checklistModalOpen, setChecklistModalOpen] = useState(false);
  const [selectedChecklistEvent, setSelectedChecklistEvent] = useState<any>(null);
  const [eventDetailsModalOpen, setEventDetailsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  
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
    <div className="space-y-8">
      {/* Custom Cozy Header */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 px-4">
        <div className="flex items-center gap-2 bg-brand-surface-2 p-1 rounded-full cozy-border">
          <button onClick={handlePrev} className="p-2 hover:bg-brand-surface rounded-full transition-colors">←</button>
          <button onClick={handleToday} className="px-6 py-2 bg-brand-surface text-[12px] font-black uppercase tracking-widest rounded-full shadow-soft">today</button>
          <button onClick={handleNext} className="p-2 hover:bg-brand-surface rounded-full transition-colors">→</button>
        </div>

        <h2 className="text-4xl font-serif font-black text-brand-text italic">
          {calendarRef.current?.getApi().view.title}
        </h2>

        <div className="flex items-center gap-2 bg-brand-surface-2 p-1 rounded-full cozy-border">
          <button 
            onClick={() => handleViewChange('dayGridMonth')}
            className={cn("px-6 py-2 text-[12px] font-black uppercase tracking-widest rounded-full transition-all", 
              currentView === 'dayGridMonth' ? "bg-brand-surface text-brand-text shadow-soft" : "text-brand-muted")}
          >
            month
          </button>
          <button 
            onClick={() => handleViewChange('timeGridWeek')}
            className={cn("px-6 py-2 text-[12px] font-black uppercase tracking-widest rounded-full transition-all", 
              currentView === 'timeGridWeek' ? "bg-brand-surface text-brand-text shadow-soft" : "text-brand-muted")}
          >
            week
          </button>
          <button 
            onClick={() => handleViewChange('timeGridDay')}
            className={cn("px-6 py-2 text-[12px] font-black uppercase tracking-widest rounded-full transition-all", 
              currentView === 'timeGridDay' ? "bg-brand-surface text-brand-text shadow-soft" : "text-brand-muted")}
          >
            day
          </button>
        </div>
      </div>

      <div className="bg-brand-surface rounded-[2.5rem] p-8 cozy-border shadow-soft overflow-hidden">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={false} // Using our custom header
          timeZone="local"
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          nowIndicator={true}
          events={userId ? fetchEvents : events}
          
          // Logic Split: Month = Editable Planner, Week/Day = Review Mode
          editable={currentView === 'dayGridMonth'} 
          eventStartEditable={currentView === 'dayGridMonth'}
          eventDurationEditable={true} // Always allow duration adjustment
          
          eventDrop={(info) => onMove(info.event.id, info.event.start!, info.event.end!)}
          eventResize={(info) => onMove(info.event.id, info.event.start!, info.event.end!)}
          
          eventContent={(eventInfo) => {
            const isCompleted = eventInfo.event.extendedProps?.metadata?.isCompleted;
            const category = eventInfo.event.extendedProps?.eventType || 'Other';
            
            return (
              <div className={cn(
                "p-2 h-full flex flex-col gap-1 transition-opacity",
                isCompleted && "opacity-50"
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-60">
                    {category}
                  </span>
                  {isCompleted && <span className="text-brand-mint text-[14px]">✓</span>}
                </div>
                <div className={cn(
                  "font-bold text-[13px] leading-tight truncate",
                  isCompleted && "line-through"
                )}>
                  {eventInfo.event.title}
                </div>
              </div>
            );
          }}
          
          eventClick={(clickInfo) => {
            const event = clickInfo.event;
            setSelectedEvent({
              id: event.id,
              title: event.title,
              start: event.start!,
              end: event.end!,
              eventType: event.extendedProps?.eventType || 'Other',
              isMovable: event.extendedProps?.isMovable ?? false,
              metadata: event.extendedProps?.metadata,
              linkedAssignmentId: event.extendedProps?.linkedAssignmentId
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
    </div>
  );
}
