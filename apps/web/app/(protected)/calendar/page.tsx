"use client";
import { useEffect, useState } from "react";
import { Calendar } from "../../../components/Calendar";

export default function CalendarPage() {
  const [events, setEvents] = useState<any[]>([
    { id: "1", title: "Class: Math 101", start: new Date(), end: new Date(Date.now()+60*60*1000), extendedProps: { isMovable: false, type: "Class" } }
  ]);

  async function onMove(id: string, start: Date, end: Date) {
    await fetch("http://localhost:8787/api/calendar/event-drop", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ id, start, end })
    });
  }

  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold mb-4">Calendar</h1>
      <Calendar events={events} onMove={onMove} />
    </main>
  );
}
