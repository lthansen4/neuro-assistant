"use client";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

export function Calendar({ events, onMove }: { events: any[]; onMove: (id:string, start:Date, end:Date)=>void }) {
  return (
    <FullCalendar
      plugins={[timeGridPlugin, interactionPlugin]}
      initialView="timeGridWeek"
      events={events}
      editable={true}
      eventStartEditable={true}
      eventDurationEditable={true}
      eventAllow={(dropInfo, draggedEvent) => Boolean((draggedEvent as any).extendedProps?.isMovable)}
      eventDrop={(info) => onMove(info.event.id, info.event.start!, info.event.end!)}
      eventResize={(info) => onMove(info.event.id, info.event.start!, info.event.end!)}
      eventDidMount={(arg) => {
        if ((arg.event as any).extendedProps?.type === 'OfficeHours') {
          (arg.el as HTMLElement).style.borderStyle = 'dotted';
        }
      }}
    />
  );
}
